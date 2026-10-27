# Arka Day Tracker

A small internal web app for tracking an operations-intern workday at Arka:
Allan's daily tasks, a supplier research log, and an end-of-day report that
builds itself from what you logged.

Built with **Next.js (App Router) + Postgres + TypeScript** so it runs the same
on Vercel (portfolio demo) and on a Mac Mini (private, real data).

---

## Screens

| Screen | What it does |
| --- | --- |
| **Today** | Greeting, today's tasks from Allan (check them off), a one-line quick log, and a running activity feed. |
| **Supplier research** | Add suppliers with their sales contact, filter for missing info, and export the list as a CSV that opens in Excel or Google Sheets. |
| **End-of-day report** | Auto-built summary — tasks done, suppliers delivered, where the time went — plus a ready-to-send message to Allan. |

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

## Roadmap

- **Slack** — pull tasks Allan sends on Slack and post the EOD report back
  (needs an app approved by Arka's workspace admin).
- **Analytics page** — suppliers per hour, contact-completion rate, time by
  category; plus multi-day history.
