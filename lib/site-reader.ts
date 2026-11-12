/**
 * Reads a supplier's own website directly and pulls out contact details with
 * plain pattern matching, so every email and phone number in the results was
 * printed on a page we actually loaded. No AI is involved in this file.
 */

export interface Page {
  url: string;
  html: string;
  text: string;
}

export type FetchOutcome =
  | { ok: true; page: Page }
  | { ok: false; blocked: boolean; reason: string };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_BYTES = 1_500_000;

export async function fetchPage(url: string, timeoutMs = 10_000): Promise<FetchOutcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      // 401/403/429/503 usually means a bot wall, not a dead company.
      const blocked = [401, 403, 406, 429, 503].includes(res.status);
      return { ok: false, blocked, reason: `HTTP ${res.status}` };
    }
    const type = res.headers.get("content-type") || "";
    if (type && !/html|xml|text\/plain/i.test(type)) {
      return { ok: false, blocked: false, reason: `Not a web page (${type.split(";")[0]})` };
    }
    const html = await readCapped(res);
    return { ok: true, page: { url: res.url || url, html, text: htmlToText(html) } };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, blocked: false, reason: aborted ? "Timed out" : "Didn't load" };
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
    if (size > MAX_BYTES) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

/* ------------------------------ HTML → text ----------------------------- */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  ndash: "–",
  mdash: "—",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/address|\/footer|\/header)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\r ]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* -------------------------------- Links --------------------------------- */

export interface Link {
  href: string;
  text: string;
}

export function extractLinks(page: Page): Link[] {
  const out: Link[] = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(page.html))) {
    const raw = decodeEntities(m[1].trim());
    if (/^(javascript|data):/i.test(raw)) continue;
    let href = raw;
    if (!/^(mailto|tel):/i.test(raw)) {
      try {
        href = new URL(raw, page.url).toString();
      } catch {
        continue;
      }
    }
    out.push({ href, text: htmlToText(m[2]).slice(0, 80) });
  }
  return out;
}

/** example.co.uk → example.co.uk; sales.example.com → example.com */
export function siteKey(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const parts = host.split(".");
    if (parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length === 2) {
      return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  } catch {
    return "";
  }
}

const CONTACT_WORDS: [RegExp, number][] = [
  [/contact/i, 10],
  [/(request|get)[-_ ]?(a[-_ ])?quote|\brfq\b|\bquote\b|estimate|inquir|enquir/i, 8],
  [/\bteam\b|staff|leadership|our[-_ ]people|management|who[-_ ]we[-_ ]are/i, 7],
  [/\bsales\b|customer[-_ ]service/i, 7],
  [/about/i, 6],
  [/location|branch|facilit|find[-_ ]us/i, 5],
];

/** Pick the same-site pages most likely to hold contact details. */
export function contactLinks(home: Page, links: Link[], max = 4): string[] {
  const key = siteKey(home.url);
  const scored = new Map<string, number>();
  for (const l of links) {
    if (!/^https?:/i.test(l.href) || siteKey(l.href) !== key) continue;
    const url = l.href.split("#")[0];
    if (url.replace(/\/$/, "") === home.url.replace(/\/$/, "")) continue;
    if (/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?)(\?|$)/i.test(url)) continue;
    const path = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    })();
    let score = 0;
    for (const [re, w] of CONTACT_WORDS) {
      if (re.test(path) || re.test(l.text)) score = Math.max(score, w);
    }
    if (score > 0) scored.set(url, Math.max(scored.get(url) ?? 0, score));
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .slice(0, max)
    .map(([u]) => u);
}

/** Same-site pages whose link text or path mentions the product. */
export function productLinks(home: Page, links: Link[], product: string, max = 2): string[] {
  const key = siteKey(home.url);
  const words = productWords(product);
  if (!words.length) return [];
  const scored = new Map<string, number>();
  for (const l of links) {
    if (!/^https?:/i.test(l.href) || siteKey(l.href) !== key) continue;
    const hay = `${l.text} ${l.href}`.toLowerCase();
    const hits = words.filter((w) => hay.includes(w)).length;
    if (hits) scored.set(l.href.split("#")[0], Math.max(scored.get(l.href) ?? 0, hits));
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([u]) => u);
}

const STOP = new Set(["with", "custom", "printed", "print", "boxes", "inch", "size", "white", "brown", "color"]);

/** "Printed corrugated mailer boxes" → ["corrugat", "mailer"] (rough stems). */
export function productWords(product: string): string[] {
  return [
    ...new Set(
      product
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4 && !STOP.has(w))
        .map((w) => w.replace(/(ies|es|s|ed|ing)$/, "").slice(0, 8))
        .filter((w) => w.length >= 4)
    ),
  ];
}

/* ------------------------------- Contacts ------------------------------- */

export interface Found {
  value: string;
  source: string;
}

const JUNK_EMAIL =
  /(example\.|domain\.com|email\.com|yourcompany|yoursite|sentry|wixpress|wix\.com|squarespace|godaddy|cloudflare|\.(png|jpe?g|gif|webp|svg|css|js)$|@\d+x\.)/i;
const SKIP_LOCAL = /^(no-?reply|donotreply|privacy|abuse|webmaster|postmaster|careers?|jobs|hr|recruit|resumes?)/i;

/** Emails printed on the page: mailto links, plain text, and Cloudflare-protected ones. */
export function extractEmails(page: Page): Found[] {
  const found = new Set<string>();
  for (const m of page.html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    found.add(decodeURIComponent(decodeEntities(m[1])));
  }
  for (const m of page.text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) found.add(m[0]);
  for (const m of page.html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) {
    const e = decodeCfEmail(m[1]);
    if (e) found.add(e);
  }
  for (const m of page.html.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) {
    const e = decodeCfEmail(m[1]);
    if (e) found.add(e);
  }
  return [...found]
    .map((e) => e.trim().replace(/[.,;:]+$/, "").toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) && !JUNK_EMAIL.test(e) && !SKIP_LOCAL.test(e))
    .map((value) => ({ value, source: page.url }));
}

function decodeCfEmail(hex: string): string {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
  } catch {
    return "";
  }
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})(?:\s*(?:x|ext\.?)\s*(\d{1,5}))?/g;

export function formatPhone(a: string, b: string, c: string, ext?: string): string {
  return `(${a}) ${b}-${c}${ext ? ` x${ext}` : ""}`;
}

/** Phone numbers on the page, tel: links first. Numbers labelled as fax are skipped. */
export function extractPhones(page: Page): Found[] {
  const out: string[] = [];
  for (const m of page.html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const d = decodeURIComponent(m[1]).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    if (d.length === 10) out.push(formatPhone(d.slice(0, 3), d.slice(3, 6), d.slice(6)));
  }
  for (const m of page.text.matchAll(PHONE_RE)) {
    const before = page.text.slice(Math.max(0, (m.index ?? 0) - 18), m.index).toLowerCase();
    if (/fax|\bf[:.]/.test(before)) continue;
    out.push(formatPhone(m[1], m[2], m[3], m[4]));
  }
  return [...new Set(out)].map((value) => ({ value, source: page.url }));
}

const FORM_EMBED = /<form\b|hsforms|hubspot\.com\/forms|jotform|wufoo|typeform|formstack|gform|wpcf7|ninja-forms|wpforms|formspree|google\.com\/forms|forms\.office\.com|zohopublic|elementor-form|fluentform/i;

/** A contact or quote page that actually has a form on it. */
export function hasForm(page: Page): boolean {
  return FORM_EMBED.test(page.html);
}

export function isContactPath(url: string): boolean {
  try {
    return /contact|quote|rfq|request|inquir|enquir|estimate/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Domain-for-sale and placeholder pages. */
export function looksParked(page: Page): boolean {
  const t = page.text.slice(0, 3000);
  return (
    (t.length < 600 &&
      /(domain|website) (is|may be) for sale|buy this domain|parked|coming soon|under construction|account (has been )?suspended/i.test(t)) ||
    /this domain (name )?(is|may be) for sale/i.test(t)
  );
}

export function copyrightYear(page: Page): number | null {
  const m = page.text.match(/(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/i);
  return m ? Number(m[1]) : null;
}

const STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";

/** US ZIP codes printed next to a state, e.g. "Joliet, IL 60431". */
export function extractZips(page: Page): string[] {
  const re = new RegExp(`\\b(?:${STATES})\\.?,?\\s+(\\d{5})(?:-\\d{4})?\\b`, "g");
  return [...new Set([...page.text.matchAll(re)].map((m) => m[1]))];
}

/** Rank emails: the named person's own address, then sales/quote inboxes, then general ones. */
export function rankEmail(email: string, siteDomain: string, person: string): number {
  const [local, domain] = email.split("@");
  let score = siteKey(`https://${domain}`) === siteDomain ? 1.5 : 1;
  const names = person.toLowerCase().split(/\s+/).filter((n) => n.length >= 3);
  if (names.some((n) => local.includes(n))) score += 4;
  else if (/sales|quote|order|estimat|rfq|purchas/.test(local)) score += 3;
  else if (/^(info|contact|hello|office|customerservice|cs|service|support|inquir)/.test(local)) score += 2;
  if (/billing|accounting|ap@|invoice|payable|marketing|media|press/.test(email)) score -= 1;
  return score;
}

export function isGenericEmail(email: string): boolean {
  return /^(info|sales|contact|hello|office|admin|customerservice|customer\.service|cs|service|support|orders?|quotes?|estimat\w*|rfq|inquir\w*|enquir\w*|purchasing|team|general|mail)@/.test(
    email
  );
}
