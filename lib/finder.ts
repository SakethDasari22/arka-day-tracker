import zipcodes from "zipcodes";
import { query } from "./db";
import type { FinderEvent, FinderInput, FinderResult, SavedSearch } from "./finder-types";

/**
 * Supplier finder. Two passes, both run by Claude with live web search/fetch:
 *
 *   1. Discover: search near the ZIP for companies that make or stock the
 *      product. Only names seen in search results are kept.
 *   2. Verify: for each candidate in range, open the company's own pages and
 *      read back whether it's active, whether it shows the product, and the
 *      best contact: named person, email, phone, contact form. Every value must
 *      come with the URL it was read from, or it is blanked.
 *
 * Rules follow Arka's research checklist: no guessed emails, no invented
 * names, drop dead companies and companies with no way to contact them.
 */

const API = process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
const MODEL = () => process.env.ANTHROPIC_RESEARCH_MODEL || "claude-sonnet-5-5";
/** Leave headroom under the 300s serverless limit. */
export const TIME_BUDGET_MS = 270_000;
const VERIFY_TIMEOUT_MS = 100_000;
const CONCURRENCY = 5;

export function finderConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/** Which engine runs searches: Gemini's free tier when its key is set. */
export function finderEngine(): "gemini" | "claude" | null {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

/** Live searches cost API credits, so the open demo can't run them by default. */
export function finderAllowed(): boolean {
  return Boolean(process.env.APP_PASSWORD) || process.env.FINDER_PUBLIC === "true";
}

/* ------------------------------- Geography ------------------------------ */

export function lookupZip(zip: string) {
  const z = zipcodes.lookup(zip.trim().slice(0, 5));
  return z ? { city: z.city, state: z.state, lat: z.latitude, lon: z.longitude } : null;
}

export function coordsFor(zip: string, city: string, state: string): { lat: number; lon: number } | null {
  const z = zip && /^\d{5}/.test(zip) ? zipcodes.lookup(zip.slice(0, 5)) : undefined;
  if (z) return { lat: z.latitude, lon: z.longitude };
  if (city && state) {
    const list = zipcodes.lookupByName(city, state);
    if (list.length) return { lat: list[0].latitude, lon: list[0].longitude };
  }
  return null;
}

export function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ------------------------------ Claude calls ---------------------------- */

interface Block {
  type: string;
  text?: string;
  name?: string;
  input?: { query?: string; url?: string };
  [k: string]: unknown;
}

interface ApiMessage {
  content: Block[];
  stop_reason: string;
}

async function callClaude(body: Record<string, unknown>, signal?: AbortSignal): Promise<ApiMessage> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (res.ok) return (await res.json()) as ApiMessage;
    // Overloaded or rate-limited: back off and retry twice.
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    let msg = `Claude API error ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error?.message) msg += `: ${j.error.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

/**
 * Run one research conversation to the end, resuming when the API pauses a
 * long tool turn. Returns all text Claude wrote plus the queries it ran.
 */
async function research(
  system: string,
  prompt: string,
  tools: Record<string, unknown>[],
  opts: { signal?: AbortSignal; onQuery?: (q: string) => void; maxTokens?: number } = {}
): Promise<string> {
  const messages: { role: string; content: unknown }[] = [{ role: "user", content: prompt }];
  let text = "";
  for (let turn = 0; turn < 4; turn++) {
    const msg = await callClaude(
      { model: MODEL(), max_tokens: opts.maxTokens ?? 4000, system, tools, messages },
      opts.signal
    );
    for (const b of msg.content) {
      if (b.type === "text" && b.text) text += b.text;
      if (b.type === "server_tool_use" && b.name === "web_search" && b.input?.query) {
        opts.onQuery?.(b.input.query);
      }
    }
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  return text;
}

/** Pull the last JSON object/array out of Claude's reply. */
export function lastJson<T>(text: string): T | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = fenced.length ? fenced.reverse() : [text];
  for (const c of candidates) {
    const start = c.search(/[[{]/);
    if (start < 0) continue;
    const open = c[start];
    const end = c.lastIndexOf(open === "[" ? "]" : "}");
    if (end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1)) as T;
    } catch {
      /* try next */
    }
  }
  return null;
}

export const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
export const isUrl = (v: string) => /^https?:\/\/\S+\.\S+/i.test(v);
export const isEmail = (v: string) => /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(v);

/* ------------------------------- Prompts -------------------------------- */

export const SYSTEM = `You research US packaging and industrial suppliers for Arka, a sourcing intermediary that serves 3PL and fulfillment companies. Results go to a manager, so nothing may be guessed.

Hard rules:
- Every value you return must come from a page or search result you actually saw in this conversation. Never fill a value from memory or from a pattern.
- Never construct or guess an email address (no first.last@ patterns). Only return an email printed on a page you opened.
- Only return a person's name and title if a page you opened shows them. Otherwise leave them blank.
- Leave anything you cannot confirm as an empty string. Blank is always better than wrong.
- Never mention or ask about Arka's client. Do not contact anyone; you are only reading public pages.
- Exclude marketplaces and lead brokers (Alibaba, Amazon, eBay, Made-in-China, IndiaMART, quote-matching sites) and overseas-only companies.`;

export function discoverPrompt(i: FinderInput, place: string, exclude: string[], want: number): string {
  return `Find US companies that manufacture or distribute: ${i.product}${i.dimensions ? ` (${i.dimensions})` : ""}.

Search near ZIP ${i.zip} (${place}), within ${i.radius} miles. Start close and widen. Use product keyword + city/county/state searches, Thomasnet and state manufacturing directories, industry association member lists, and business listings. Include alternate product names and distributors that stock the item.

Find up to ${want} candidate companies, nearest first. ${exclude.length ? `Skip these, already contacted: ${exclude.join("; ")}.` : ""}

Reply with only a JSON array in a \`\`\`json block:
[{"company": "", "website": "homepage URL", "city": "", "state": "2-letter", "zip": "5-digit if shown, else empty", "type": "Manufacturer or Distributor", "why": "what they make, max 12 words"}]`;
}

function verifyPrompt(i: FinderInput, c: Candidate): string {
  return `Check this supplier for a sourcing request and find the best way to reach their sales team.

Company: ${c.company}
Website: ${c.website || "unknown — search for the official site"}
Location: ${[c.city, c.state].filter(Boolean).join(", ") || "unknown"}
Product needed: ${i.product}${i.dimensions ? ` — ${i.dimensions}` : ""}

Steps:
1. Open the company's own website. Is it live and active now (current copyright year, recent news, listed hours, working quote flow)? A dead or parked site means active=false.
2. Find a product, catalog or capabilities page that shows this product or a close equivalent. Marketing words alone ("packaging solutions") don't count.
3. Contact hunt, best first: a named sales/account manager, inside sales, customer service, then owner or GM, with their email. Check contact, about, team, sales, quote, locations pages and the footer; open a linked catalog or spec-sheet PDF if one exists. If no named person, a printed general address (sales@, info@) is acceptable. Then the main or sales phone number, then the contact or quote-request form link.
4. Find the street address and ZIP of the location nearest ${i.zip}.

Reply with only a JSON object in a \`\`\`json block, empty strings for anything not confirmed:
{"active": true, "active_evidence_url": "", "product_available": "yes|no|unclear", "product_url": "", "contact_person": "", "contact_title": "", "person_source_url": "", "email": "", "email_type": "personal|generic", "email_source_url": "", "phone": "", "phone_source_url": "", "contact_form_url": "", "website": "", "city": "", "state": "", "zip": "", "notes": "one short line"}`;
}

/* -------------------------------- Engine -------------------------------- */

export interface Candidate {
  company: string;
  website: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  distance: number | null;
}

export async function runFinder(
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

  // Skip suppliers already on the chosen project.
  let exclude: string[] = [];
  if (input.projectId) {
    const r = await query<{ supplier: string }>(
      `SELECT supplier FROM outreach WHERE project_id = $1`,
      [input.projectId]
    );
    exclude = r.rows.map((x) => x.supplier);
  }

  const searchId = await saveStart(input);
  const results: FinderResult[] = [];
  let dropped = 0;

  try {
    // ---- Pass 1: discover ----
    emit({ type: "status", text: `Searching within ${input.radius} miles of ${origin.city}, ${origin.state}…` });
    const want = Math.min(30, Math.max(8, Math.round(input.count * 2)));
    const discoverText = await research(
      SYSTEM,
      discoverPrompt(input, `${origin.city}, ${origin.state}`, exclude, want),
      [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 8,
          user_location: { type: "approximate", city: origin.city, region: origin.state, country: "US" },
        },
      ],
      { onQuery: (q) => emit({ type: "search", query: q }), maxTokens: 4000 }
    );
    const raw = lastJson<Record<string, unknown>[]>(discoverText) ?? [];

    const seen = new Set(exclude.map((e) => e.toLowerCase()));
    const candidates: Candidate[] = [];
    for (const r of Array.isArray(raw) ? raw : []) {
      const company = s(r.company);
      if (!company || seen.has(company.toLowerCase())) continue;
      seen.add(company.toLowerCase());
      const city = s(r.city);
      const state = s(r.state).toUpperCase().slice(0, 2);
      const zip = s(r.zip).slice(0, 5);
      const at = coordsFor(zip, city, state);
      candidates.push({
        company,
        website: s(r.website),
        city,
        state,
        zip,
        type: s(r.type) || "",
        distance: at ? Math.round(miles(origin, at)) : null,
      });
    }
    // Small leeway: a ZIP centroid isn't the exact street address.
    const inRange = candidates
      .filter((c) => c.distance === null || c.distance <= input.radius * 1.05)
      .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
    emit({ type: "candidates", total: candidates.length, inRange: inRange.length });

    if (!inRange.length) {
      throw new Error(
        candidates.length
          ? `Found ${candidates.length} companies, but none within ${input.radius} miles. Try a larger radius.`
          : "No companies turned up for that product. Try a broader product name or a larger radius."
      );
    }

    // ---- Pass 2: verify, a few at a time ----
    const queue = [...inRange];
    const qualifying = () => results.filter((r) => r.product_available === "yes").length;

    async function worker() {
      while (queue.length && qualifying() < input.count && left() > 60_000) {
        const c = queue.shift()!;
        emit({ type: "checking", company: c.company });
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), Math.min(VERIFY_TIMEOUT_MS, left() - 10_000));
        try {
          const text = await research(
            SYSTEM,
            verifyPrompt(input, c),
            [
              { type: "web_fetch_20250910", name: "web_fetch", max_uses: 6, max_content_tokens: 6000 },
              { type: "web_search_20250305", name: "web_search", max_uses: 2 },
            ],
            { signal: ctrl.signal, maxTokens: 2500 }
          );
          const v = lastJson<Record<string, unknown>>(text);
          const outcome = v ? toResult(c, v, home, input.radius) : { drop: "Couldn't read the company's site" };
          if ("drop" in outcome) {
            dropped++;
            emit({ type: "dropped", company: c.company, reason: outcome.drop });
          } else {
            results.push(outcome);
            emit({ type: "result", result: outcome });
          }
        } catch (e) {
          dropped++;
          const aborted = e instanceof Error && e.name === "AbortError";
          emit({ type: "dropped", company: c.company, reason: aborted ? "Took too long to check" : "Check failed" });
        } finally {
          clearTimeout(timer);
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
      `${yes} supplier${yes === 1 ? "" : "s"} with the product confirmed` +
      (results.length > yes ? `, ${results.length - yes} that need a product check` : "") +
      ` · ${results.filter((r) => r.email).length} with an email · ${dropped} dropped` +
      (yes < input.count
        ? queue.length
          ? ` · stopped at the time limit, run again to check ${queue.length} more`
          : ` · fewer than ${input.count} qualified in ${input.radius} mi`
        : "");
    await saveEnd(searchId, "done", results, summary);
    emit({ type: "done", searchId, results, summary });
  } catch (e) {
    const text = e instanceof Error ? e.message : "Search failed";
    await saveEnd(searchId, results.length ? "done" : "error", results, text);
    if (results.length) {
      emit({ type: "done", searchId, results, summary: `${results.length} found before an error: ${text}` });
    } else {
      emit({ type: "error", text });
    }
  }
}

/** Apply the checklist to Claude's findings. Returns a row, or why it was dropped. */
function toResult(
  c: Candidate,
  v: Record<string, unknown>,
  origin: { lat: number; lon: number },
  radius: number
): FinderResult | { drop: string } {
  if (v.active === false || s(v.active) === "false") return { drop: "Site looks inactive or closed" };

  const src = (k: string) => {
    const u = s(v[k]);
    return isUrl(u) ? u : "";
  };

  // Email: must look real and come with the page it was printed on.
  let email = s(v.email).replace(/^mailto:/i, "");
  const emailSrc = src("email_source_url");
  if (!isEmail(email) || !emailSrc) email = "";
  // Person: name only with a source page.
  const personSrc = src("person_source_url");
  const person = personSrc ? s(v.contact_person) : "";
  const phone = s(v.phone).replace(/[^\d()+\-.\sxX]/g, "").trim();
  const phoneOk = phone.replace(/\D/g, "").length >= 10;
  const form = src("contact_form_url");

  if (!email && !phoneOk && !form) return { drop: "No email, phone or contact form found" };

  const city = s(v.city) || c.city;
  const state = (s(v.state) || c.state).toUpperCase().slice(0, 2);
  const zip = s(v.zip).slice(0, 5) || c.zip;
  const at = coordsFor(zip, city, state);
  const distance = at ? Math.round(miles(origin, at)) : c.distance;
  if (distance !== null && distance > radius * 1.05) {
    return { drop: `Nearest location is ${distance} mi away` };
  }

  const pa = s(v.product_available).toLowerCase();
  return {
    company: c.company,
    website: src("website") || (isUrl(c.website) ? c.website : c.website ? `https://${c.website}` : ""),
    type: c.type,
    city,
    state,
    zip,
    distance_miles: distance,
    contact_person: person,
    contact_title: person ? s(v.contact_title) : "",
    email,
    email_type: email ? (s(v.email_type) === "personal" ? "personal" : "generic") : "",
    phone: phoneOk ? phone : "",
    contact_form_url: form,
    product_available: pa === "yes" ? "yes" : pa === "no" ? "no" : "unclear",
    sources: {
      active: src("active_evidence_url") || undefined,
      product: src("product_url") || undefined,
      person: personSrc || undefined,
      email: emailSrc || undefined,
      phone: (phoneOk && src("phone_source_url")) || undefined,
    },
    notes: s(v.notes).slice(0, 200),
  };
}

/* ------------------------------- Storage -------------------------------- */

export async function saveStart(i: FinderInput): Promise<number | null> {
  try {
    const r = await query<{ id: number }>(
      `INSERT INTO supplier_searches (product, dimensions, zip, radius_miles, project_id, status)
       VALUES ($1,$2,$3,$4,$5,'running') RETURNING id`,
      [i.product, i.dimensions || null, i.zip, i.radius, i.projectId ?? null]
    );
    return r.rows[0].id;
  } catch {
    return null;
  }
}

export async function saveEnd(id: number | null, status: string, results: FinderResult[], summary: string) {
  if (!id) return;
  await query(
    `UPDATE supplier_searches SET status=$2, results=$3, summary=$4, finished_at=now() WHERE id=$1`,
    [id, status, JSON.stringify(results), summary]
  ).catch(() => {});
}

export async function listSearches(limit = 10): Promise<SavedSearch[]> {
  const r = await query<SavedSearch>(
    `SELECT id, product, dimensions, zip, radius_miles, project_id, status, summary,
            COALESCE(results, '[]'::jsonb) AS results, created_at::text AS created_at
       FROM supplier_searches
      WHERE status <> 'running' OR created_at > now() - interval '10 minutes'
      ORDER BY id DESC LIMIT $1`,
    [limit]
  );
  return r.rows;
}

export async function deleteSearch(id: number): Promise<void> {
  await query(`DELETE FROM supplier_searches WHERE id = $1`, [id]);
}
