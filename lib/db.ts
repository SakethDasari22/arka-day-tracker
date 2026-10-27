import { Pool, type QueryResult, type QueryResultRow } from "pg";

/**
 * One Postgres pool per server process. On serverless (Vercel) this is created
 * per cold start, which is fine. Locally on the Mac Mini it lives for the life
 * of `next start`.
 */

function connectionString(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    undefined
  );
}

export function isDbConfigured(): boolean {
  return Boolean(connectionString());
}

let pool: Pool | null = null;

function getPool(): Pool {
  const cs = connectionString();
  if (!cs) {
    throw new Error(
      "No database configured. Set DATABASE_URL (local) or add a Postgres store on Vercel (POSTGRES_URL)."
    );
  }
  if (!pool) {
    const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(cs);
    pool = new Pool({
      connectionString: cs,
      // Managed Postgres (Neon / Vercel / Supabase) requires SSL; local does not.
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
    // Make CURRENT_DATE / now() resolve to the user's day, not UTC, so the
    // tracker rolls over at local midnight rather than 7pm Chicago time.
    const tz = process.env.APP_TIMEZONE || "America/Chicago";
    pool.on("connect", (client) => {
      client.query(`SET TIME ZONE '${tz.replace(/'/g, "")}'`).catch(() => {});
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  await ensureReady();
  return getPool().query<T>(text, params as never[]);
}

/** Raw query that does NOT trigger schema init — used by init itself. */
async function raw<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as never[]);
}

let readyPromise: Promise<void> | null = null;

/** Create tables (idempotent) and seed demo data once per process. */
function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await createSchema();
      await seedDemoIfAppropriate();
    })().catch((err) => {
      // Reset so a later request can retry after a transient DB hiccup.
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

async function createSchema(): Promise<void> {
  await raw(`
    CREATE TABLE IF NOT EXISTS assignments (
      id SERIAL PRIMARY KEY,
      day DATE NOT NULL DEFAULT CURRENT_DATE,
      title TEXT NOT NULL,
      area TEXT,
      material TEXT,
      need TEXT,
      raw_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await raw(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      day DATE NOT NULL DEFAULT CURRENT_DATE,
      title TEXT NOT NULL,
      tag TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      done BOOLEAN NOT NULL DEFAULT false,
      sort INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await raw(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      day DATE NOT NULL DEFAULT CURRENT_DATE,
      company TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Manufacturer',
      contact TEXT,
      email TEXT,
      phone TEXT,
      website TEXT,
      location TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await raw(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      day DATE NOT NULL DEFAULT CURRENT_DATE,
      text TEXT NOT NULL,
      tag TEXT,
      minutes INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Google OAuth tokens. Single-user tool, so we keep one row keyed by account.
  await raw(`
    CREATE TABLE IF NOT EXISTS google_tokens (
      account TEXT PRIMARY KEY,
      email TEXT,
      access_token TEXT,
      refresh_token TEXT,
      scope TEXT,
      token_type TEXT,
      expiry_date BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Link a Google Sheet to an assignment (v2). IF NOT EXISTS keeps this safe to
  // re-run on an existing database.
  await raw(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS sheet_id TEXT`);
  await raw(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS sheet_name TEXT`);
  await raw(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS sheet_url TEXT`);

  // Remember where an imported supplier came from, so re-imports don't duplicate.
  await raw(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS source TEXT`);
  await raw(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS source_key TEXT`);
}

/**
 * In demo mode (no APP_PASSWORD) we auto-populate today so the portfolio
 * deployment never looks empty. In private mode we leave it clean for real data.
 */
async function seedDemoIfAppropriate(): Promise<void> {
  if (process.env.APP_PASSWORD) return; // private mode: no demo data
  if (process.env.SEED_DEMO === "false") return;

  const existing = await raw<{ n: string }>(
    `SELECT (SELECT count(*) FROM tasks WHERE day = CURRENT_DATE)
          + (SELECT count(*) FROM suppliers WHERE day = CURRENT_DATE) AS n`
  );
  if (Number(existing.rows[0]?.n ?? 0) > 0) return;

  await raw(
    `INSERT INTO assignments (title, area, material, need, raw_message)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      "Corrugated board suppliers",
      "ZIP 60446 + 100 mi",
      "Corrugated board, paperboard",
      "Manufacturers + distributors",
      "Morning! Today: find corrugated board manufacturers and distributors around 60446 — company, sales contact, email, phone, website. Sheet by EOD. Also follow up on Friday's two distributors.",
    ]
  );

  const tasks: [string, string, string, boolean, number][] = [
    ["Find corrugated board suppliers near ZIP 60446", "Research", "progress", false, 0],
    ["Put suppliers and sales contacts in the sheet", "Sheet", "todo", false, 1],
    ["Follow up on the 2 distributors from Friday", "Follow-up", "done", true, 2],
  ];
  for (const [title, tag, status, done, sort] of tasks) {
    await raw(
      `INSERT INTO tasks (title, tag, status, done, sort) VALUES ($1,$2,$3,$4,$5)`,
      [title, tag, status, done, sort]
    );
  }

  const suppliers: [string, string, string, string, string, string, string][] = [
    ["Sample Box Co.", "Manufacturer", "J. Doe, Sales Mgr", "jdoe@example.com", "(815) 555-0101", "example.com", "Joliet, IL"],
    ["Prairie Corrugated", "Manufacturer", "A. Smith, Account Exec", "asmith@example.com", "(630) 555-0144", "example.com", "Aurora, IL"],
    ["Midwest Board Supply", "Distributor", "R. Lee, Inside Sales", "", "(708) 555-0177", "example.com", "Bolingbrook, IL"],
    ["Lakeside Packaging", "Manufacturer", "M. Patel, Sales Rep", "mpatel@example.com", "", "example.com", "Elgin, IL"],
    ["Fox River Paperboard", "Distributor", "K. Brown, Branch Mgr", "kbrown@example.com", "(847) 555-0122", "example.com", "Rockford, IL"],
    ["Hoosier Carton", "Manufacturer", "T. Nguyen, Sales", "tnguyen@example.com", "(219) 555-0190", "example.com", "Gary, IN"],
    ["Great Lakes Container", "Distributor", "S. Okafor, Sales", "sokafor@example.com", "(312) 555-0166", "example.com", "Chicago, IL"],
    ["Valley Paper Products", "Manufacturer", "D. Kim, Account Mgr", "dkim@example.com", "(815) 555-0133", "example.com", "DeKalb, IL"],
  ];
  for (const [company, type, contact, email, phone, website, location] of suppliers) {
    await raw(
      `INSERT INTO suppliers (company, type, contact, email, phone, website, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [company, type, contact, email, phone, website, location]
    );
  }

  const logs: [string, string, number][] = [
    ["Added 3 distributors from Joliet and Aurora to the sheet", "Supplier research", 50],
    ["Found 5 manufacturers within 100 mi, verified websites", "Supplier research", 70],
    ["Emailed both Friday distributors for a pricing contact", "Follow-ups", 30],
    ["Replied to Allan on Slack: confirmed today's tasks", "Slack / other", 10],
  ];
  for (const [text, tag, minutes] of logs) {
    await raw(
      `INSERT INTO activity_log (text, tag, minutes) VALUES ($1,$2,$3)`,
      [text, tag, minutes]
    );
  }
}
