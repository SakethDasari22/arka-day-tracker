# Arka Day Tracker

A small internal web app for tracking an operations-intern workday at Arka:
Allan's daily tasks, a supplier research log, an end-of-day report that
builds itself from what you logged, and an end-to-end **sourcing pipeline**
that tracks every client project from request to delivery, with analytics.

Built with **Next.js (App Router) + Postgres + TypeScript** so it runs the same
on Vercel (portfolio demo) and on a Mac Mini (private, real data).

---

## Screens

| Screen | What it does |
| --- | --- |
| **Today** | Greeting, today's tasks from Allan (check them off), a one-line quick log, and a running activity feed. |
| **Supplier research** | Add suppliers with their sales contact, filter for missing info, and export the list as a CSV that opens in Excel or Google Sheets. |
| **End-of-day report** | Auto-built summary — tasks done, suppliers delivered, where the time went — plus a ready-to-send message to Allan. |
| **Projects** | One card per client request with an 8-stage tracker. Inside: suppliers contacted, quotes ranked by a weighted score, samples and client approval, bulk order and delivery. |
| **Find suppliers** | Enter the product, dimensions, a ZIP and a radius (up to 1,000 miles). Claude searches the web, opens each company's site, and returns company, contact person, email or contact form, and phone — each with the page it was read from. Add the ones you want to a project in one click. |
| **Analytics** | Supplier funnel, days spent between stages, reply rate by state and supplier type, price spread, savings vs the median quote, on-time delivery, and a follow-up list. |

---

## Sourcing pipeline

How a project runs, and where each step is logged:

| # | Step | Logged as |
| --- | --- | --- |
| 1 | Client sends the requirement: product, quantity, specs, deadline | **New project** |
| 2 | Research suppliers who can make it exactly | **Suppliers contacted** (one row each, with reply status) |
| 3 | Suppliers send quotes | **Log quote**: unit price, MOQ, lead time, spec match, shipping |
| 4 | Compare and pick the best | Quotes are ranked automatically; **Shortlist top 3** |
| 5 | Sample goes to the client | **Send sample**, then the sent date |
| 6 | Client approves or rejects | Decision + feedback |
| 7 | Bulk order ships to the client | **Place bulk order**, ship and delivery dates |

The stage tracker fills itself in from those records, so there is nothing to
update by hand. Arka sits in the middle, so the client never sees the supplier
and the supplier never sees the client — in the public demo every name is fake.

**Supplier score** (`quote_scores` view): price (incl. shipping per unit) 40%,
lead time 25%, spec match 20%, MOQ 15%. Price, lead time and MOQ are min-max
scaled within each project; spec match is a 1–5 rating. The Analytics page
reports how often the #1-ranked quote is the one the client approves.

**SQL** — the tables and the two analysis views (`project_timeline`,
`quote_scores`) are in [`sql/pipeline.sql`](sql/pipeline.sql); the Analytics
queries are in `lib/pipeline-analytics.ts`.

**Power BI / Excel** — *Export CSV* on Projects or Analytics downloads one flat
table (one row per supplier contacted, with its quote, sample and order).

---

## Run it locally (Mac Mini)

1. Install [Node 18+](https://nodejs.org) and have a Postgres database handy.
   The easiest free option that also works on Vercel is [Neon](https://neon.tech)
   — create a database and copy its connection string.
2. Copy the env file and fill it in:
   ```bash
   cp .env.example .env
   # then edit .env and set DATABASE_URL=...
   ```
3. Install and start:
   ```bash
   npm install
   npm run dev
   ```
4. Open http://localhost:3000. Tables are created automatically on first load.

### Public demo vs. private real data

- **Leave `APP_PASSWORD` blank** → the app is open and auto-fills today with
  sample (fake) suppliers. Use this for the portfolio deployment.
- **Set `APP_PASSWORD`** → the app is locked behind that password and starts
  empty for your real Arka data. Set it in `.env` locally, or as an environment
  variable on Vercel.

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project** and import the repo.
3. Open the project's **Storage** tab → create a **Postgres** store and connect
   it. Vercel sets `POSTGRES_URL` automatically.
4. (Optional) In **Settings → Environment Variables**, add `APP_PASSWORD` to
   lock the deployment.
5. Deploy. Visit the URL — the schema is created on first request.

---

## Tech notes

- **Data layer** — `lib/db.ts` owns the pool and creates the schema on first
  query (`CREATE TABLE IF NOT EXISTS`). `lib/queries.ts` has every typed read
  and write. No ORM, so it's easy to read.
- **Timezone** — the DB connection is set to `America/Chicago` (override with
  `APP_TIMEZONE`) so "today" rolls over at local midnight.
- **Auth** — a lightweight cookie gate in `middleware.ts`; it's a convenience
  lock for a single-user tool, not a secrets vault.

## Google integration (Gmail · Sheets · Drive)

The deployed app signs in as **itself** with its own Google OAuth client, so you
need to create that client once. ~5 minutes.

1. Go to the [Google Cloud Console](https://console.cloud.google.com) → create a
   project (any name).
2. **APIs & Services → Enabled APIs → Enable APIs** and enable: **Gmail API**,
   **Google Sheets API**, **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → External → fill the basics. While
   it's in "Testing", add your own Google address under **Test users**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   type **Web application**. Add **Authorized redirect URIs**:
   - `https://YOUR-VERCEL-URL/api/google/callback`
   - `http://localhost:3000/api/google/callback` (for local testing)
5. Copy the **Client ID** and **Client secret**. On Vercel (**Settings →
   Environment Variables**) add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`,
   then redeploy.
6. Open the app → **Connections** → **Connect Google**, and sign in.

Then:
- **Today → Pull from Gmail** turns one of Allan's emails into an assignment plus
  checklist tasks (summarized by Claude if `ANTHROPIC_API_KEY` is set, otherwise
  by a built-in parser).
- **Connections → Allan's supplier sheet** links the Google Sheet he shared.
- **Supplier research → Import from sheet** pulls its rows into your supplier log
  as tracked work (re-imports skip rows already there).

## Supplier finder

Runs free on Google's Gemini API free tier, in three steps:
1. **Discover** — Gemini 2.5 Flash with Google Search grounding lists
   companies near the ZIP that make or stock the product; only those inside
   the radius are kept (distance from ZIP centroids, nearest first).
2. **Read** — the app opens each company's own site (homepage, contact,
   about/team and product pages) and pulls emails, phone numbers, contact
   forms and street ZIPs straight out of the HTML with pattern matching,
   including Cloudflare-hidden emails. Fax numbers are skipped.
3. **Judge** — a small free model (Gemini 3.1 Flash-Lite) reads only that
   page text to say whether the product is shown and who the named sales
   contact is. A "yes" needs an exact quote found on the page, and a name
   must be printed on the page, or they are discarded.

Companies that are parked, out of range, block automated reading, or show no
email, phone or form are dropped and listed in the search log. Every value
links to the page it was read from. Every search is saved.

**Setup (free):** create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
and add it as `GEMINI_API_KEY`. Live searches only run when `APP_PASSWORD` is
set (or `FINDER_PUBLIC=true`). Free-tier limits allow roughly 10 searches a
day; a search takes 2–4 minutes.

**Optional paid engine:** if `ANTHROPIC_API_KEY` is set and `GEMINI_API_KEY`
is not, searches run on Claude with web search and web fetch instead.

## Roadmap

- **Slack** — pull tasks Allan sends on Slack and post the EOD report back
  (needs an app approved by Arka's workspace admin).
- **Power BI version** of the Analytics page, built on the CSV export.
- Pull supplier replies from Gmail straight into the outreach list.
