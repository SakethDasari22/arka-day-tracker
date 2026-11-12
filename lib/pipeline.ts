import { query } from "./db";
import {
  STAGES,
  type OrderRow,
  type OutreachRow,
  type ProjectDetail,
  type ProjectRow,
  type QuoteRow,
  type SampleRow,
} from "./pipeline-types";

/* ------------------------------- Reads ---------------------------------- */

const PROJECT_COLS = `
  id, client, product, quantity, unit, specs, target_price::text AS target_price,
  deadline::text AS deadline, received_on::text AS received_on, status, notes,
  first_contact_on::text AS first_contact_on, first_quote_on::text AS first_quote_on,
  sample_requested_on::text AS sample_requested_on, sample_sent_on::text AS sample_sent_on,
  approved_on::text AS approved_on, ordered_on::text AS ordered_on,
  delivered_on::text AS delivered_on,
  suppliers_contacted, suppliers_replied, quotes_count,
  CASE WHEN deadline IS NULL THEN NULL ELSE (deadline - CURRENT_DATE)::int END AS days_to_deadline`;

function withStage(row: Omit<ProjectRow, "stage_index">): ProjectRow {
  let stage_index = 0;
  STAGES.forEach((s, i) => {
    if (row[s.key as keyof typeof row]) stage_index = i;
  });
  return { ...row, stage_index };
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { rows } = await query<Omit<ProjectRow, "stage_index">>(
    `SELECT ${PROJECT_COLS}
       FROM project_timeline
      ORDER BY (status IN ('active','on_hold')) DESC,
               deadline ASC NULLS LAST, id DESC`
  );
  return rows.map(withStage);
}

export async function getProjectDetail(id: number): Promise<ProjectDetail | null> {
  const p = await query<Omit<ProjectRow, "stage_index">>(
    `SELECT ${PROJECT_COLS} FROM project_timeline WHERE id = $1`,
    [id]
  );
  if (!p.rows[0]) return null;

  const [outreach, quotes, samples, orders] = await Promise.all([
    query<OutreachRow>(
      `SELECT id, project_id, supplier, supplier_type, location, state, contact, email, phone,
              website, channel, contacted_on::text AS contacted_on, replied_on::text AS replied_on,
              outcome, notes,
              CASE WHEN replied_on IS NULL AND outcome IN ('waiting')
                   THEN (CURRENT_DATE - contacted_on)::int END AS days_waiting
         FROM outreach WHERE project_id = $1
        ORDER BY contacted_on, id`,
      [id]
    ),
    query<QuoteRow>(
      `SELECT id, project_id, outreach_id, supplier, state, unit_price::text AS unit_price, moq,
              lead_time_days, spec_match, shipping_cost::text AS shipping_cost,
              quoted_on::text AS quoted_on, valid_until::text AS valid_until, shortlisted, notes,
              ROUND(effective_price, 4)::text AS effective_price, score::text AS score, score_rank,
              ROUND(price_score, 2)::text AS price_score, ROUND(lead_score, 2)::text AS lead_score,
              ROUND(moq_score, 2)::text AS moq_score, ROUND(spec_score, 2)::text AS spec_score,
              moq_ok
         FROM quote_scores WHERE project_id = $1
        ORDER BY score_rank, id`,
      [id]
    ),
    query<SampleRow>(
      `SELECT s.id, s.project_id, s.quote_id, o.supplier, q.unit_price::text AS unit_price,
              s.requested_on::text AS requested_on, s.sent_on::text AS sent_on, s.decision,
              s.decided_on::text AS decided_on, s.feedback
         FROM samples s
         JOIN quotes q ON q.id = s.quote_id
         JOIN outreach o ON o.id = q.outreach_id
        WHERE s.project_id = $1
        ORDER BY s.requested_on, s.id`,
      [id]
    ),
    query<OrderRow>(
      `SELECT r.id, r.project_id, r.quote_id, o.supplier, r.quantity, r.unit_price::text AS unit_price,
              r.ordered_on::text AS ordered_on, r.shipped_on::text AS shipped_on,
              r.delivered_on::text AS delivered_on, r.tracking, r.notes
         FROM orders r
         JOIN quotes q ON q.id = r.quote_id
         JOIN outreach o ON o.id = q.outreach_id
        WHERE r.project_id = $1
        ORDER BY r.ordered_on, r.id`,
      [id]
    ),
  ]);

  return {
    project: withStage(p.rows[0]),
    outreach: outreach.rows,
    quotes: quotes.rows,
    samples: samples.rows,
    orders: orders.rows,
  };
}

/* ------------------------------- Writes --------------------------------- */

type FieldKind = "text" | "int" | "num" | "date" | "bool" | { oneOf: string[] };

interface EntityDef {
  table: string;
  fields: Record<string, FieldKind>;
  /** Fields that must be present (non-empty) on create. */
  required: string[];
}

/**
 * Every column a client is allowed to write, per table. Anything not listed is
 * ignored, which keeps the generic routes safe from arbitrary column names.
 */
export const ENTITIES: Record<string, EntityDef> = {
  projects: {
    table: "projects",
    required: ["client", "product"],
    fields: {
      client: "text",
      product: "text",
      quantity: "int",
      unit: "text",
      specs: "text",
      target_price: "num",
      deadline: "date",
      received_on: "date",
      status: { oneOf: ["active", "on_hold", "lost", "done"] },
      notes: "text",
    },
  },
  outreach: {
    table: "outreach",
    required: ["project_id", "supplier"],
    fields: {
      project_id: "int",
      supplier: "text",
      supplier_type: "text",
      location: "text",
      state: "text",
      contact: "text",
      email: "text",
      phone: "text",
      website: "text",
      channel: "text",
      contacted_on: "date",
      replied_on: "date",
      outcome: { oneOf: ["waiting", "no_reply", "declined", "quoting", "quoted"] },
      notes: "text",
    },
  },
  quotes: {
    table: "quotes",
    required: ["outreach_id", "unit_price"],
    fields: {
      outreach_id: "int",
      unit_price: "num",
      moq: "int",
      lead_time_days: "int",
      spec_match: "int",
      shipping_cost: "num",
      quoted_on: "date",
      valid_until: "date",
      shortlisted: "bool",
      notes: "text",
    },
  },
  samples: {
    table: "samples",
    required: ["quote_id"],
    fields: {
      quote_id: "int",
      requested_on: "date",
      sent_on: "date",
      decision: { oneOf: ["pending", "approved", "rejected"] },
      decided_on: "date",
      feedback: "text",
    },
  },
  orders: {
    table: "orders",
    required: ["quote_id"],
    fields: {
      quote_id: "int",
      quantity: "int",
      unit_price: "num",
      ordered_on: "date",
      shipped_on: "date",
      delivered_on: "date",
      tracking: "text",
      notes: "text",
    },
  },
};

export class InputError extends Error {}

function clean(kind: FieldKind, name: string, v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null || (typeof v === "string" && v.trim() === "")) return null;
  if (kind === "text") return String(v).trim();
  if (kind === "bool") return v === true || v === "true";
  if (kind === "int" || kind === "num") {
    const n = Number(String(v).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n)) throw new InputError(`${label(name)} must be a number`);
    return kind === "int" ? Math.round(n) : n;
  }
  if (kind === "date") {
    const s = String(v).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new InputError(`${label(name)} must be a date`);
    return s;
  }
  const s = String(v);
  if (!kind.oneOf.includes(s)) throw new InputError(`${label(name)} is not a valid option`);
  return s;
}

function label(name: string): string {
  return name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function pick(def: EntityDef, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(def.fields)) {
    const v = clean(kind, name, body[name]);
    if (v !== undefined) out[name] = v;
  }
  return out;
}

/** Find the project a child row belongs to, so the client can't mismatch it. */
async function parentProject(entity: string, data: Record<string, unknown>): Promise<number> {
  if (entity === "outreach") return Number(data.project_id);
  if (entity === "quotes") {
    const r = await query<{ project_id: number }>(
      `SELECT project_id FROM outreach WHERE id = $1`,
      [data.outreach_id]
    );
    if (!r.rows[0]) throw new InputError("That supplier isn't on this project");
    return r.rows[0].project_id;
  }
  const r = await query<{ project_id: number }>(
    `SELECT project_id FROM quotes WHERE id = $1`,
    [data.quote_id]
  );
  if (!r.rows[0]) throw new InputError("That quote no longer exists");
  return r.rows[0].project_id;
}

export async function createRow(
  entity: string,
  body: Record<string, unknown>
): Promise<{ id: number; project_id: number }> {
  const def = ENTITIES[entity];
  if (!def) throw new InputError("Unknown record type");
  const data = pick(def, body);
  for (const r of def.required) {
    if (data[r] == null) throw new InputError(`${label(r)} is required`);
  }

  // Sensible defaults that mirror the real workflow.
  if (entity === "orders") {
    const q = await query<{ unit_price: string; quantity: number | null }>(
      `SELECT q.unit_price::text AS unit_price, p.quantity
         FROM quotes q JOIN projects p ON p.id = q.project_id WHERE q.id = $1`,
      [data.quote_id]
    );
    if (q.rows[0]) {
      if (data.unit_price == null) data.unit_price = Number(q.rows[0].unit_price);
      if (data.quantity == null) data.quantity = q.rows[0].quantity;
    }
  }

  let projectId: number;
  if (entity === "projects") {
    projectId = 0;
  } else {
    projectId = await parentProject(entity, data);
    data.project_id = projectId;
  }

  const cols = Object.keys(data);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO ${def.table} (${cols.join(", ")})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})
     RETURNING id`,
    cols.map((c) => data[c])
  );
  const id = rows[0].id;

  // A logged quote means the supplier replied with one.
  if (entity === "quotes") {
    await query(
      `UPDATE outreach o
          SET outcome = 'quoted',
              replied_on = COALESCE(o.replied_on, q.quoted_on)
         FROM quotes q
        WHERE q.id = $1 AND o.id = q.outreach_id`,
      [id]
    );
  }
  await afterWrite(entity, id);
  return { id, project_id: entity === "projects" ? id : projectId };
}

export async function updateRow(
  entity: string,
  id: number,
  body: Record<string, unknown>
): Promise<void> {
  const def = ENTITIES[entity];
  if (!def) throw new InputError("Unknown record type");
  const data = pick(def, body);
  // Parent links are fixed once created.
  delete data.project_id;
  delete data.outreach_id;
  delete data.quote_id;

  // Filling a reply or decision without a date stamps today.
  if (entity === "outreach" && data.outcome && data.outcome !== "waiting" && data.outcome !== "no_reply" && !("replied_on" in data)) {
    await query(`UPDATE outreach SET replied_on = COALESCE(replied_on, CURRENT_DATE) WHERE id = $1`, [id]);
  }
  if (entity === "samples" && (data.decision === "approved" || data.decision === "rejected") && !("decided_on" in data)) {
    await query(`UPDATE samples SET decided_on = COALESCE(decided_on, CURRENT_DATE) WHERE id = $1`, [id]);
  }
  if (entity === "samples" && data.decision === "pending") data.decided_on = null;

  const cols = Object.keys(data);
  if (cols.length) {
    await query(
      `UPDATE ${def.table} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1`,
      [id, ...cols.map((c) => data[c])]
    );
  }
  await afterWrite(entity, id);
}

export async function deleteRow(entity: string, id: number): Promise<void> {
  const def = ENTITIES[entity];
  if (!def) throw new InputError("Unknown record type");
  await query(`DELETE FROM ${def.table} WHERE id = $1`, [id]);
}

/** Keep the project status in step with what actually happened. */
async function afterWrite(entity: string, id: number): Promise<void> {
  if (entity === "orders") {
    await query(
      `UPDATE projects p SET status = 'done'
         FROM orders r
        WHERE r.id = $1 AND p.id = r.project_id AND r.delivered_on IS NOT NULL
          AND p.status = 'active'`,
      [id]
    );
  }
}
