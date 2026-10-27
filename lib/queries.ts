import { query } from "./db";
import type {
  Assignment,
  LogEntry,
  Supplier,
  SupplierType,
  SupplierView,
  Task,
  TaskStatus,
} from "./types";

/* ------------------------------- Assignment ------------------------------ */

export async function getAssignment(): Promise<Assignment | null> {
  const { rows } = await query<Assignment>(
    `SELECT id, day::text AS day, title, area, material, need, raw_message,
            sheet_id, sheet_name, sheet_url
       FROM assignments
      WHERE day = CURRENT_DATE
      ORDER BY id DESC
      LIMIT 1`
  );
  return rows[0] ?? null;
}

export interface AssignmentInput {
  title: string;
  area?: string;
  material?: string;
  need?: string;
  raw_message?: string;
}

/** Replace today's assignment with a new one (one active assignment per day). */
export async function setAssignment(input: AssignmentInput): Promise<Assignment> {
  // Preserve a linked sheet across a re-parse of the assignment.
  const prev = await getAssignment();
  await query(`DELETE FROM assignments WHERE day = CURRENT_DATE`);
  const { rows } = await query<Assignment>(
    `INSERT INTO assignments (title, area, material, need, raw_message, sheet_id, sheet_name, sheet_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, day::text AS day, title, area, material, need, raw_message, sheet_id, sheet_name, sheet_url`,
    [
      input.title,
      input.area ?? null,
      input.material ?? null,
      input.need ?? null,
      input.raw_message ?? null,
      prev?.sheet_id ?? null,
      prev?.sheet_name ?? null,
      prev?.sheet_url ?? null,
    ]
  );
  return rows[0];
}

/** Link (or clear) a Google Sheet on today's assignment. Creates a stub
 * assignment if none exists yet so the link has somewhere to live. */
export async function setAssignmentSheet(
  sheet: { id: string; name: string; url: string } | null
): Promise<Assignment> {
  const existing = await getAssignment();
  if (!existing) {
    await query(
      `INSERT INTO assignments (title, sheet_id, sheet_name, sheet_url)
       VALUES ($1,$2,$3,$4)`,
      ["Supplier research", sheet?.id ?? null, sheet?.name ?? null, sheet?.url ?? null]
    );
  } else {
    await query(
      `UPDATE assignments SET sheet_id=$2, sheet_name=$3, sheet_url=$4 WHERE id=$1`,
      [existing.id, sheet?.id ?? null, sheet?.name ?? null, sheet?.url ?? null]
    );
  }
  return (await getAssignment())!;
}

/**
 * Best-effort parse of a free-text task message from Allan into structured
 * fields. Pulls a ZIP, a radius, and a rough material phrase. Anything it can't
 * find is left blank for the user to fill.
 */
export function parseAssignment(message: string): AssignmentInput {
  const zip = message.match(/\b(\d{5})\b/)?.[1];
  const radius = message.match(/(\d{1,3})\s*(?:mi|mile|miles)\b/i)?.[1];
  const area = [
    zip ? `ZIP ${zip}` : null,
    radius ? `${radius} mi` : null,
  ]
    .filter(Boolean)
    .join(" + ");

  const materialMatch = message.match(
    /\b(corrugated board|corrugated|paperboard|cardboard|packaging|folding carton[s]?)\b/i
  );
  const needs: string[] = [];
  if (/manufacturer/i.test(message)) needs.push("Manufacturers");
  if (/distributor/i.test(message)) needs.push("Distributors");

  return {
    title: materialMatch
      ? `${capitalize(materialMatch[1])} suppliers`
      : "Supplier research",
    area: area || undefined,
    material: materialMatch ? capitalize(materialMatch[1]) : undefined,
    need: needs.length ? needs.join(" + ") : undefined,
    raw_message: message,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------------------------------- Tasks -------------------------------- */

export async function getTasks(): Promise<Task[]> {
  const { rows } = await query<Task>(
    `SELECT id, day::text AS day, title, tag, status, done, sort
       FROM tasks
      WHERE day = CURRENT_DATE
      ORDER BY sort ASC, id ASC`
  );
  return rows;
}

export async function addTask(
  title: string,
  tag: string | null
): Promise<Task> {
  const { rows } = await query<Task>(
    `INSERT INTO tasks (title, tag, sort)
     VALUES ($1, $2, COALESCE((SELECT max(sort)+1 FROM tasks WHERE day = CURRENT_DATE), 0))
     RETURNING id, day::text AS day, title, tag, status, done, sort`,
    [title, tag]
  );
  return rows[0];
}

export async function setTaskDone(id: number, done: boolean): Promise<void> {
  await query(
    `UPDATE tasks
        SET done = $2,
            status = CASE WHEN $2 THEN 'done'
                          WHEN status = 'done' THEN 'progress'
                          ELSE status END
      WHERE id = $1`,
    [id, done]
  );
}

export async function setTaskStatus(
  id: number,
  status: TaskStatus
): Promise<void> {
  await query(
    `UPDATE tasks SET status = $2, done = ($2 = 'done') WHERE id = $1`,
    [id, status]
  );
}

export async function deleteTask(id: number): Promise<void> {
  await query(`DELETE FROM tasks WHERE id = $1`, [id]);
}

/* -------------------------------- Suppliers ------------------------------ */

export async function getSuppliers(): Promise<SupplierView[]> {
  const { rows } = await query<Supplier>(
    `SELECT id, day::text AS day, company, type, contact, email, phone, website, location
       FROM suppliers
      WHERE day = CURRENT_DATE
      ORDER BY id DESC`
  );
  return rows.map((r) => ({
    ...r,
    complete: Boolean(r.email && r.phone),
  }));
}

export interface SupplierInput {
  company: string;
  type: SupplierType;
  contact?: string;
  email?: string;
  phone?: string;
  website?: string;
  location?: string;
}

export async function addSupplier(input: SupplierInput): Promise<Supplier> {
  const { rows } = await query<Supplier>(
    `INSERT INTO suppliers (company, type, contact, email, phone, website, location)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, day::text AS day, company, type, contact, email, phone, website, location`,
    [
      input.company,
      input.type,
      input.contact ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.website ?? null,
      input.location ?? null,
    ]
  );
  return rows[0];
}

export async function deleteSupplier(id: number): Promise<void> {
  await query(`DELETE FROM suppliers WHERE id = $1`, [id]);
}

/**
 * Import rows from a Google Sheet into today's supplier log. Columns are matched
 * to fields by header name (flexible), the company column is required, and
 * re-imports skip rows already pulled from the same sheet.
 */
export async function importSuppliersFromSheet(
  sheet: { headers: string[]; rows: string[][] },
  sheetId: string
): Promise<{ added: number; skipped: number }> {
  const idx = mapColumns(sheet.headers);
  if (idx.company < 0) {
    throw new Error(
      "Couldn't find a Company column in that sheet. Add a header like 'Company' or 'Supplier'."
    );
  }
  const source = `sheet:${sheetId}`;
  const { rows: existingRows } = await query<{ source_key: string }>(
    `SELECT source_key FROM suppliers WHERE day = CURRENT_DATE AND source = $1 AND source_key IS NOT NULL`,
    [source]
  );
  const seen = new Set(existingRows.map((r) => r.source_key));

  let added = 0;
  let skipped = 0;
  for (const row of sheet.rows) {
    const company = cell(row, idx.company);
    if (!company) continue;
    const key = company.toLowerCase();
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    const typeRaw = cell(row, idx.type).toLowerCase();
    const type: SupplierType = typeRaw.startsWith("dist") ? "Distributor" : "Manufacturer";
    await query(
      `INSERT INTO suppliers (company, type, contact, email, phone, website, location, source, source_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        company,
        type,
        cell(row, idx.contact) || null,
        cell(row, idx.email) || null,
        cell(row, idx.phone) || null,
        cell(row, idx.website) || null,
        cell(row, idx.location) || null,
        source,
        key,
      ]
    );
    added++;
  }
  return { added, skipped };
}

function cell(row: string[], i: number): string {
  return i >= 0 && row[i] != null ? String(row[i]).trim() : "";
}

function mapColumns(headers: string[]): {
  company: number;
  type: number;
  contact: number;
  email: number;
  phone: number;
  website: number;
  location: number;
} {
  const find = (re: RegExp) =>
    headers.findIndex((h) => re.test((h || "").toLowerCase()));
  return {
    company: find(/company|supplier|vendor|business|^name$/),
    type: find(/type|category|kind/),
    contact: find(/contact|rep|salesperson|sales contact|person/),
    email: find(/e-?mail/),
    phone: find(/phone|tel|mobile|cell/),
    website: find(/website|url|site|web/),
    location: find(/location|city|state|address|region/),
  };
}

/* ------------------------------- Activity log ---------------------------- */

export async function getLog(): Promise<LogEntry[]> {
  const { rows } = await query<LogEntry>(
    `SELECT id, day::text AS day, text, tag, minutes, created_at::text AS created_at
       FROM activity_log
      WHERE day = CURRENT_DATE
      ORDER BY created_at DESC, id DESC`
  );
  return rows;
}

export async function addLog(
  text: string,
  tag: string | null,
  minutes: number | null
): Promise<LogEntry> {
  const { rows } = await query<LogEntry>(
    `INSERT INTO activity_log (text, tag, minutes)
     VALUES ($1,$2,$3)
     RETURNING id, day::text AS day, text, tag, minutes, created_at::text AS created_at`,
    [text, tag, minutes]
  );
  return rows[0];
}

export async function deleteLog(id: number): Promise<void> {
  await query(`DELETE FROM activity_log WHERE id = $1`, [id]);
}

/* --------------------------------- Report -------------------------------- */

export interface DayReport {
  tasksTotal: number;
  tasksDone: number;
  suppliersTotal: number;
  manufacturers: number;
  distributors: number;
  suppliersComplete: number;
  minutesByTag: { tag: string; minutes: number }[];
  totalMinutes: number;
}

export async function getDayReport(): Promise<DayReport> {
  const [tasks, suppliers, log] = await Promise.all([
    getTasks(),
    getSuppliers(),
    getLog(),
  ]);

  const byTag = new Map<string, number>();
  for (const e of log) {
    if (!e.minutes) continue;
    const tag = e.tag || "Other";
    byTag.set(tag, (byTag.get(tag) ?? 0) + e.minutes);
  }
  const minutesByTag = [...byTag.entries()]
    .map(([tag, minutes]) => ({ tag, minutes }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    tasksTotal: tasks.length,
    tasksDone: tasks.filter((t) => t.done).length,
    suppliersTotal: suppliers.length,
    manufacturers: suppliers.filter((s) => s.type === "Manufacturer").length,
    distributors: suppliers.filter((s) => s.type === "Distributor").length,
    suppliersComplete: suppliers.filter((s) => s.complete).length,
    minutesByTag,
    totalMinutes: minutesByTag.reduce((a, b) => a + b.minutes, 0),
  };
}
