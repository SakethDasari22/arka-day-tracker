import zipcodes from "zipcodes";
import { query } from "./db";
import {
  coordsFor,
  discoverPrompt,
  lastJson,
  lookupZip,
  miles,
  s,
  saveEnd,
  saveStart,
  SYSTEM,
  TIME_BUDGET_MS,
  type Candidate,
} from "./finder";
import type { FinderEvent, FinderInput, FinderResult } from "./finder-types";
import {
  contactLinks,
  copyrightYear,
  extractEmails,
  extractLinks,
  extractPhones,
  extractZips,
  fetchPage,
  hasForm,
  isContactPath,
  isGenericEmail,
  looksParked,
  productLinks,
  productWords,
  rankEmail,
  siteKey,
  type Found,
  type Page,
} from "./site-reader";

/**
 * Free version of the supplier finder, on Google's Gemini API free tier.
 *
 *   1. Discover: Gemini 2.5 Flash with Google Search grounding (free tier)
 *      lists companies near the ZIP.
 *   2. Read: this server opens each company's own site (homepage, contact,
 *      about/team and product pages) and pulls emails, phone numbers, contact
 *      forms and ZIPs out of the HTML with plain pattern matching.
 *   3. Judge: a small free model reads the fetched page text only to say
 *      whether the product is shown and who the named sales contact is. Its
 *      answers are checked against the page text before they are kept.
 *
 * Free-tier limits are tight (a handful of requests per minute), so reads are
 * spaced out and the search falls back to Flash-Lite when Flash is busy.
 */

const BASE = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta";
const SEARCH_MODEL = () => process.env.GEMINI_SEARCH_MODEL || "gemini-2.5-flash";
const SEARCH_FALLBACK = "gemini-2.5-flash-lite";
const READ_MODEL = () => process.env.GEMINI_READ_MODEL || "gemini-3.1-flash-lite";
/** Keep reads under the free tier's ~15 requests/minute. */
const READ_SPACING_MS = Number(process.env.GEMINI_READ_SPACING_MS || 4500);
const CONCURRENCY = 4;
const COMPANY_BUDGET_MS = 60_000;

class RateLimited extends Error {}

interface GeminiReply {
  text: string;
  queries: string[];
}

async function gemini(
  model: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<GeminiReply> {
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY as string,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 429) throw new RateLimited(`${model} is at its free-tier limit`);
  if (!res.ok) {
    let msg = `Gemini API error ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error?.message) msg += `: ${j.error.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const j = await res.json();
  const cand = j?.candidates?.[0];
  const text: string = (cand?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  const queries: string[] = cand?.groundingMetadata?.webSearchQueries ?? [];
  return { text, queries };
}

let nextReadAt = 0;
/** Space out read-model calls across all concurrent workers. */
async function readSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextReadAt);
  nextReadAt = at + READ_SPACING_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

/* ------------------------------- Discover ------------------------------- */

async function discover(
  input: FinderInput,
  place: string,
  exclude: string[],
  want: number,
  onQuery: (q: string) => void
): Promise<Record<string, unknown>[]> {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: discoverPrompt(input, place, exclude, want) +
      "\n\nFor website, give the company's own homepage (e.g. https://www.example.com), never a directory or search link." }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  };
  let reply: GeminiReply;
  try {
    reply = await gemini(SEARCH_MODEL(), body);
  } catch (e) {
    if (!(e instanceof RateLimited)) throw e;
    reply = await gemini(SEARCH_FALLBACK, body);
  }
  reply.queries.forEach(onQuery);
  const list = lastJson<Record<string, unknown>[]>(reply.text);
  return Array.isArray(list) ? list : [];
}

/* --------------------------------- Read --------------------------------- */

interface Judgement {
  product_available: "yes" | "no" | "unclear";
  product_url: string;
  contact_person: string;
  contact_title: string;
  person_source_url: string;
  notes: string;
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

/** Ask the read model about product fit and a named contact, then check its answer against the pages. */
async function judge(input: FinderInput, company: string, pages: Page[]): Promise<Judgement | null> {
  const budget = 26_000;
  const per = Math.floor(budget / pages.length);
  const corpus = pages.map((p) => `=== PAGE ${p.url}\n${p.text.slice(0, per)}`).join("\n\n");
  const prompt = `Supplier: ${company}
Product the buyer needs: ${input.product}${input.dimensions ? ` (${input.dimensions})` : ""}

Below is text copied from this supplier's own website. Using ONLY this text:
1. Does the site show this product or a close equivalent? "yes" only if a product, catalog or capabilities section names it; "no" if the site clearly sells something else; otherwise "unclear". Quote the exact words that show it.
2. Is a person named who handles sales, quotes, customer service, purchasing, or is the owner/GM? Give the name exactly as printed and their title. Never invent a name.

${corpus}

Return JSON: {"product_available":"yes|no|unclear","product_quote":"exact words from the text","product_url":"URL of the page with that quote","contact_person":"","contact_title":"","person_source_url":"","notes":"one short line"}`;

  await readSlot();
  let reply: GeminiReply;
  try {
    reply = await gemini(READ_MODEL(), {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 600, responseMimeType: "application/json" },
    });
  } catch {
    return null;
  }
  const v = lastJson<Record<string, unknown>>(reply.text);
  if (!v) return null;

  const byUrl = new Map(pages.map((p) => [p.url, norm(p.text)]));
  const allText = norm(pages.map((p) => p.text).join(" "));

  // Product: the quote must really be on one of the pages.
  let pa = s(v.product_available).toLowerCase();
  const quote = norm(s(v.product_quote));
  const quoteOk = quote.length >= 4 && allText.includes(quote);
  if (pa === "yes" && !quoteOk) pa = "unclear";
  let productUrl = s(v.product_url);
  if (!byUrl.has(productUrl)) {
    productUrl = quoteOk ? pages.find((p) => norm(p.text).includes(quote))?.url ?? "" : "";
  }

  // Person: the exact name must be printed on the cited page (or any page).
  let person = s(v.contact_person);
  let personSrc = s(v.person_source_url);
  if (person) {
    const n = norm(person);
    if (!byUrl.get(personSrc)?.includes(n)) {
      personSrc = pages.find((p) => norm(p.text).includes(n))?.url ?? "";
    }
    if (!personSrc || n.split(" ").length < 2) {
      person = "";
      personSrc = "";
    }
  }

  return {
    product_available: pa === "yes" ? "yes" : pa === "no" ? "no" : "unclear",
    product_url: pa === "yes" ? productUrl : "",
    contact_person: person,
    contact_title: person ? s(v.contact_title).slice(0, 80) : "",
    person_source_url: personSrc,
    // The model's own note is only kept when its product claim checked out.
    notes: quoteOk ? s(v.notes).slice(0, 160) : "",
  };
}

function homepageOf(raw: string): string {
  const w = raw.trim();
  if (!w) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
    if (/google\.|vertexaisearch|bing\.|yelp\.|thomasnet\.|linkedin\.|facebook\./i.test(u.hostname)) return "";
    return `${u.protocol}//${u.host}/`;
  } catch {
    return "";
  }
}

/** Open a candidate's site and build a result row, or say why it was dropped. */
async function readCompany(
  input: FinderInput,
  c: Candidate,
  origin: { lat: number; lon: number }
): Promise<FinderResult | { drop: string }> {
  const started = Date.now();
  const home = homepageOf(c.website);
  if (!home) return { drop: "No company website found" };

  let first = await fetchPage(home);
  if (!first.ok && !first.blocked && home.includes("://www.") === false) {
    first = await fetchPage(home.replace("://", "://www."));
  }
  if (!first.ok) {
    return { drop: first.blocked ? "Site blocks automated reading — check it by hand" : `Website ${first.reason.toLowerCase()}` };
  }
  const homePage = first.page;
  if (looksParked(homePage)) return { drop: "Site looks parked or closed" };

  // Pick the contact-ish and product pages to open.
  const links = extractLinks(homePage);
  let toOpen = contactLinks(homePage, links, 4);
  if (!toOpen.some(isContactPath)) {
    const root = new URL(homePage.url).origin;
    toOpen = [`${root}/contact`, `${root}/contact-us`, ...toOpen].slice(0, 5);
  }
  toOpen.push(...productLinks(homePage, links, input.product, 2).filter((u) => !toOpen.includes(u)));

  const pages: Page[] = [homePage];
  const fetched = await Promise.all(
    toOpen.map((u) => (Date.now() - started < COMPANY_BUDGET_MS - 15_000 ? fetchPage(u, 8_000) : null))
  );
  for (const f of fetched) {
    if (f?.ok && !pages.some((p) => p.url === f.page.url)) pages.push(f.page);
  }

  // Contacts, straight from the HTML.
  const emailMap = new Map<string, Found>();
  const phones: Found[] = [];
  for (const p of pages) {
    for (const e of extractEmails(p)) if (!emailMap.has(e.value)) emailMap.set(e.value, e);
    phones.push(...extractPhones(p));
  }
  // Contact page numbers before homepage ones.
  phones.sort((a, b) => Number(isContactPath(b.source)) - Number(isContactPath(a.source)));
  const formPage =
    pages.find((p) => isContactPath(p.url) && hasForm(p)) ?? pages.find((p) => p !== homePage && hasForm(p));

  if (emailMap.size === 0 && !phones.length && !formPage) {
    return { drop: "No email, phone or contact form on the site" };
  }

  // Location: a ZIP printed on the site, nearest to the search ZIP.
  let zip = c.zip;
  let city = c.city;
  let state = c.state;
  let distance = c.distance;
  const zips = [...new Set(pages.flatMap(extractZips))];
  let best: { zip: string; d: number; city: string; state: string } | null = null;
  for (const z of zips) {
    const info = zipcodes.lookup(z);
    if (!info) continue;
    const d = Math.round(miles(origin, { lat: info.latitude, lon: info.longitude }));
    if (!best || d < best.d) best = { zip: z, d, city: info.city, state: info.state };
  }
  if (best) {
    ({ zip, city, state } = best);
    distance = best.d;
  } else if (distance === null) {
    const at = coordsFor(zip, city, state);
    distance = at ? Math.round(miles(origin, at)) : null;
  }
  if (distance !== null && distance > input.radius * 1.05) {
    return { drop: `Nearest location is ${distance} mi away` };
  }

  // Product and named contact (best effort on the free tier). Runs last so
  // dropped companies don't use up free-tier requests.
  const j = await judge(input, c.company, pages);
  const person = j?.contact_person ?? "";

  const siteDomain = siteKey(homePage.url);
  const emails = [...emailMap.values()].sort(
    (a, b) => rankEmail(b.value, siteDomain, person) - rankEmail(a.value, siteDomain, person)
  );
  const email = emails[0];
  const phone = phones[0];

  // Without the read model, fall back to a keyword check.
  let available: FinderResult["product_available"] = j?.product_available ?? "unclear";
  const notes: string[] = [];
  if (!j) {
    const words = productWords(input.product);
    const text = pages.map((p) => p.text.toLowerCase()).join(" ");
    const hits = words.filter((w) => text.includes(w)).length;
    notes.push(hits && hits >= Math.ceil(words.length / 2) ? "Product words appear on the site — confirm" : "Couldn't confirm the product");
  } else if (j.notes) {
    notes.push(j.notes);
  }
  const year = copyrightYear(homePage);
  if (year && year < new Date().getFullYear() - 2) notes.push(`Site footer says © ${year}`);

  return {
    company: c.company,
    website: new URL(homePage.url).origin,
    type: c.type,
    city,
    state,
    zip,
    distance_miles: distance,
    contact_person: person,
    contact_title: j?.contact_title ?? "",
    email: email?.value ?? "",
    email_type: email ? (isGenericEmail(email.value) ? "generic" : "personal") : "",
    phone: phone?.value ?? "",
    contact_form_url: formPage?.url ?? "",
    product_available: available,
    sources: {
      active: homePage.url,
      product: j?.product_url || undefined,
      person: j?.person_source_url || undefined,
      email: email?.source,
      phone: phone?.source,
    },
    notes: notes.join(" · ").slice(0, 200),
  };
}

/* -------------------------------- Engine -------------------------------- */

export async function runFreeFinder(
  input: FinderInput,
  emit: (e: FinderEvent) => void
): Promise<void> {
  const started = Date.now();
  const left = () => TIME_BUDGET_MS - (Date.now() - started);

  const origin = lookupZip(input.zip);
  if (!origin) {
    emit({ type: "error", text: `ZIP ${input.zip} wasn't recognized. Check the 5-digit code.` });
    return;
  }
  emit({ type: "origin", city: origin.city, state: origin.state });
  const home = { lat: origin.lat, lon: origin.lon };

  let exclude: string[] = [];
  if (input.projectId) {
    const r = await query<{ supplier: string }>(`SELECT supplier FROM outreach WHERE project_id = $1`, [
      input.projectId,
    ]);
    exclude = r.rows.map((x) => x.supplier);
  }

  const searchId = await saveStart(input);
  const results: FinderResult[] = [];
  let dropped = 0;
  const seen = new Set(exclude.map((e) => e.toLowerCase()));
  const seenSites = new Set<string>();

  const toCandidates = (raw: Record<string, unknown>[]): Candidate[] => {
    const out: Candidate[] = [];
    for (const r of raw) {
      const company = s(r.company);
      if (!company || seen.has(company.toLowerCase())) continue;
      const site = siteKey(homepageOf(s(r.website)) || "http://x.invalid");
      if (site && site !== "x.invalid" && seenSites.has(site)) continue;
      seen.add(company.toLowerCase());
      if (site) seenSites.add(site);
      const city = s(r.city);
      const state = s(r.state).toUpperCase().slice(0, 2);
      const zip = s(r.zip).slice(0, 5);
      const at = coordsFor(zip, city, state);
      out.push({
        company,
        website: s(r.website),
        city,
        state,
        zip,
        type: s(r.type),
        distance: at ? Math.round(miles(home, at)) : null,
      });
    }
    return out;
  };

  try {
    const place = `${origin.city}, ${origin.state}`;
    emit({ type: "status", text: `Searching Google within ${input.radius} miles of ${place}…` });
    const want = Math.min(25, Math.max(8, Math.round(input.count * 2)));
    let candidates = toCandidates(
      await discover(input, place, exclude, want, (q) => emit({ type: "search", query: q }))
    );
    const inRange = (list: Candidate[]) =>
      list
        .filter((c) => c.distance === null || c.distance <= input.radius * 1.05)
        .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

    // One more search round if the first came back thin.
    if (inRange(candidates).length < input.count && left() > 200_000) {
      emit({ type: "status", text: "Widening the search…" });
      try {
        const more = await discover(input, place, [...exclude, ...candidates.map((c) => c.company)], want, (q) =>
          emit({ type: "search", query: q })
        );
        candidates = [...candidates, ...toCandidates(more)];
      } catch {
        /* keep what we have */
      }
    }

    const queue = inRange(candidates);
    emit({ type: "candidates", total: candidates.length, inRange: queue.length });
    if (!queue.length) {
      throw new Error(
        candidates.length
          ? `Found ${candidates.length} companies, but none within ${input.radius} miles. Try a larger radius.`
          : "No companies turned up for that product. Try a broader product name or a larger radius."
      );
    }
    emit({ type: "status", text: `Found ${candidates.length} companies, ${queue.length} in range. Opening each website…` });

    const qualifying = () => results.filter((r) => r.product_available === "yes").length;
    async function worker() {
      while (queue.length && qualifying() < input.count && left() > 45_000) {
        const c = queue.shift()!;
        emit({ type: "checking", company: c.company });
        try {
          const outcome = await Promise.race([
            readCompany(input, c, home),
            new Promise<{ drop: string }>((r) => setTimeout(() => r({ drop: "Took too long to check" }), COMPANY_BUDGET_MS)),
          ]);
          if ("drop" in outcome) {
            dropped++;
            emit({ type: "dropped", company: c.company, reason: outcome.drop });
          } else {
            results.push(outcome);
            emit({ type: "result", result: outcome });
          }
        } catch {
          dropped++;
          emit({ type: "dropped", company: c.company, reason: "Check failed" });
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    results.sort(
      (a, b) =>
        Number(b.product_available === "yes") - Number(a.product_available === "yes") ||
        (a.distance_miles ?? 1e9) - (b.distance_miles ?? 1e9)
    );
    const yes = qualifying();
    const summary =
      `${yes} with the product confirmed` +
      (results.length > yes ? `, ${results.length - yes} to check` : "") +
      ` · ${results.filter((r) => r.email).length} with an email · ${results.filter((r) => r.contact_person).length} named contact${results.filter((r) => r.contact_person).length === 1 ? "" : "s"} · ${dropped} dropped` +
      (queue.length ? ` · ${queue.length} not checked (time limit) — run again` : "");
    await saveEnd(searchId, "done", results, summary);
    emit({ type: "done", searchId, results, summary });
  } catch (e) {
    let text = e instanceof Error ? e.message : "Search failed";
    if (e instanceof RateLimited) {
      text = "Gemini's free daily search limit is used up. It resets at midnight Pacific time — try again then.";
    }
    await saveEnd(searchId, results.length ? "done" : "error", results, text);
    if (results.length) {
      emit({ type: "done", searchId, results, summary: `${results.length} found before an error: ${text}` });
    } else {
      emit({ type: "error", text });
    }
  }
}
