import { query } from "./db";

/**
 * Every number on the Analytics page comes from one of these queries. They
 * read the project_timeline and quote_scores views, so the definitions live in
 * one place (lib/pipeline-schema.ts) and match the CSV export.
 */

export interface Kpis {
  projects: number;
  open_projects: number;
  delivered: number;
  median_days_to_order: number | null;
  on_time_rate: number | null;
  on_time_n: number;
  contacted: number;
  replied: number;
  quoted: number;
  reply_rate: number | null;
  quote_rate: number | null;
  avg_reply_days: number | null;
  sample_decided: number;
  sample_approved: number;
  approval_rate: number | null;
  top_pick_hits: number;
  top_pick_n: number;
  savings_pct: number | null;
  savings_usd: number | null;
  savings_n: number;
}

export interface FunnelStep {
  label: string;
  n: number;
}

export interface StageTime {
  label: string;
  avg_days: number | null;
  n: number;
}

export interface GroupRate {
  grp: string;
  contacted: number;
  replied: number;
  quoted: number;
  reply_rate: number;
  avg_reply_days: number | null;
}

export interface ProductPrice {
  product: string;
  unit: string | null;
  quotes: number;
  min_price: number;
  median_price: number;
  max_price: number;
  chosen_price: number | null;
}

export interface FollowUp {
  project_id: number;
  client: string;
  supplier: string;
  days: number;
  kind: "no_reply" | "quote_expiring";
}

export interface Analytics {
  kpis: Kpis;
  funnel: FunnelStep[];
  stageTimes: StageTime[];
  byState: GroupRate[];
  byType: GroupRate[];
  prices: ProductPrice[];
  followUps: FollowUp[];
}

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

// A supplier "replied" if we logged a reply date or any answer.
const REPLIED = `(o.replied_on IS NOT NULL OR o.outcome IN ('declined','quoting','quoted'))`;

export async function getAnalytics(): Promise<Analytics> {
  const [proj, sup, samp, saving, funnel, stages, byState, byType, prices, followUps] =
    await Promise.all([
      query(`
        SELECT count(*)::int AS projects,
               count(*) FILTER (WHERE status IN ('active','on_hold'))::int AS open_projects,
               count(delivered_on)::int AS delivered,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY ordered_on - received_on)
                 FILTER (WHERE ordered_on IS NOT NULL) AS median_days_to_order,
               avg((delivered_on <= deadline)::int)
                 FILTER (WHERE delivered_on IS NOT NULL AND deadline IS NOT NULL) AS on_time_rate,
               count(*) FILTER (WHERE delivered_on IS NOT NULL AND deadline IS NOT NULL)::int AS on_time_n
          FROM project_timeline`),
      query(`
        SELECT count(*)::int AS contacted,
               count(*) FILTER (WHERE ${REPLIED})::int AS replied,
               count(*) FILTER (WHERE o.outcome = 'quoted')::int AS quoted,
               avg(o.replied_on - o.contacted_on) FILTER (WHERE o.replied_on IS NOT NULL) AS avg_reply_days
          FROM outreach o`),
      query(`
        SELECT count(*) FILTER (WHERE s.decision <> 'pending')::int AS decided,
               count(*) FILTER (WHERE s.decision = 'approved')::int AS approved,
               count(*) FILTER (WHERE s.decision = 'approved' AND qs.score_rank = 1)::int AS top_hits
          FROM samples s
          JOIN quote_scores qs ON qs.id = s.quote_id`),
      // Savings: what the client paid vs the median quote on the same project.
      query(`
        WITH med AS (
          SELECT project_id,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_price) AS median_price
            FROM quotes GROUP BY project_id HAVING count(*) >= 2
        )
        SELECT avg((m.median_price - r.unit_price) / NULLIF(m.median_price, 0)) AS savings_pct,
               sum((m.median_price - r.unit_price) * COALESCE(r.quantity, 0)) AS savings_usd,
               count(*)::int AS n
          FROM orders r JOIN med m ON m.project_id = r.project_id
         WHERE r.unit_price IS NOT NULL`),
      query(`
        SELECT
          (SELECT count(*) FROM outreach)::int AS contacted,
          (SELECT count(*) FROM outreach o WHERE ${REPLIED})::int AS replied,
          (SELECT count(*) FROM quotes)::int AS quoted,
          (SELECT count(*) FROM quotes WHERE shortlisted)::int AS shortlisted,
          (SELECT count(DISTINCT quote_id) FROM samples WHERE sent_on IS NOT NULL)::int AS sampled,
          (SELECT count(DISTINCT quote_id) FROM samples WHERE decision = 'approved')::int AS approved,
          (SELECT count(DISTINCT quote_id) FROM orders)::int AS ordered`),
      query(`
        SELECT avg(first_contact_on - received_on)        AS s1, count(first_contact_on - received_on)::int AS n1,
               avg(first_quote_on - first_contact_on)     AS s2, count(first_quote_on - first_contact_on)::int AS n2,
               avg(sample_requested_on - first_quote_on)  AS s3, count(sample_requested_on - first_quote_on)::int AS n3,
               avg(sample_sent_on - sample_requested_on)  AS s4, count(sample_sent_on - sample_requested_on)::int AS n4,
               avg(approved_on - sample_sent_on)          AS s5, count(approved_on - sample_sent_on)::int AS n5,
               avg(ordered_on - approved_on)              AS s6, count(ordered_on - approved_on)::int AS n6,
               avg(delivered_on - ordered_on)             AS s7, count(delivered_on - ordered_on)::int AS n7
          FROM project_timeline`),
      query<GroupRate>(groupSql("COALESCE(NULLIF(o.state, ''), 'Unknown')")),
      query<GroupRate>(groupSql("COALESCE(NULLIF(o.supplier_type, ''), 'Unknown')")),
      query(`
        SELECT p.product, p.unit, count(*)::int AS quotes,
               min(q.unit_price) AS min_price,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY q.unit_price) AS median_price,
               max(q.unit_price) AS max_price,
               (SELECT r.unit_price FROM orders r WHERE r.project_id = p.id ORDER BY r.id LIMIT 1) AS chosen_price
          FROM quotes q JOIN projects p ON p.id = q.project_id
         GROUP BY p.id, p.product, p.unit
         ORDER BY p.id DESC`),
      query<FollowUp>(`
        SELECT * FROM (
          SELECT p.id AS project_id, p.client, o.supplier,
                 (CURRENT_DATE - o.contacted_on)::int AS days, 'no_reply' AS kind
            FROM outreach o JOIN projects p ON p.id = o.project_id
           WHERE o.outcome = 'waiting' AND o.replied_on IS NULL
             AND CURRENT_DATE - o.contacted_on >= 3 AND p.status = 'active'
          UNION ALL
          SELECT p.id, p.client, qs.supplier,
                 (qs.valid_until - CURRENT_DATE)::int, 'quote_expiring'
            FROM quote_scores qs JOIN projects p ON p.id = qs.project_id
           WHERE qs.valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
             AND p.status = 'active' AND qs.shortlisted
        ) f
        ORDER BY kind, days DESC
        LIMIT 12`),
    ]);

  const p = proj.rows[0];
  const s = sup.rows[0];
  const sm = samp.rows[0];
  const sv = saving.rows[0];
  const f = funnel.rows[0];
  const st = stages.rows[0];

  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

  const kpis: Kpis = {
    projects: p.projects,
    open_projects: p.open_projects,
    delivered: p.delivered,
    median_days_to_order: num(p.median_days_to_order),
    on_time_rate: num(p.on_time_rate),
    on_time_n: p.on_time_n,
    contacted: s.contacted,
    replied: s.replied,
    quoted: s.quoted,
    reply_rate: ratio(s.replied, s.contacted),
    quote_rate: ratio(s.quoted, s.contacted),
    avg_reply_days: num(s.avg_reply_days),
    sample_decided: sm.decided,
    sample_approved: sm.approved,
    approval_rate: ratio(sm.approved, sm.decided),
    top_pick_hits: sm.top_hits,
    top_pick_n: sm.approved,
    savings_pct: num(sv?.savings_pct),
    savings_usd: num(sv?.savings_usd),
    savings_n: sv?.n ?? 0,
  };

  const stageLabels = [
    "Request → first supplier contact",
    "First contact → first quote",
    "First quote → best quote picked",
    "Picked → sample sent",
    "Sample sent → client approval",
    "Approval → bulk order",
    "Bulk order → delivered",
  ];

  return {
    kpis,
    funnel: [
      { label: "Suppliers contacted", n: f.contacted },
      { label: "Replied", n: f.replied },
      { label: "Sent a quote", n: f.quoted },
      { label: "Shortlisted (top 3)", n: f.shortlisted },
      { label: "Sample sent", n: f.sampled },
      { label: "Client approved", n: f.approved },
      { label: "Bulk ordered", n: f.ordered },
    ],
    stageTimes: stageLabels.map((label, i) => ({
      label,
      avg_days: num(st[`s${i + 1}`]),
      n: st[`n${i + 1}`],
    })),
    byState: byState.rows.map(normGroup),
    byType: byType.rows.map(normGroup),
    prices: prices.rows.map((r) => ({
      product: r.product,
      unit: r.unit,
      quotes: r.quotes,
      min_price: Number(r.min_price),
      median_price: Number(r.median_price),
      max_price: Number(r.max_price),
      chosen_price: num(r.chosen_price),
    })),
    followUps: followUps.rows,
  };
}

function groupSql(expr: string): string {
  return `
    SELECT ${expr} AS grp,
           count(*)::int AS contacted,
           count(*) FILTER (WHERE ${REPLIED})::int AS replied,
           count(*) FILTER (WHERE o.outcome = 'quoted')::int AS quoted,
           count(*) FILTER (WHERE ${REPLIED})::float / count(*) AS reply_rate,
           avg(o.replied_on - o.contacted_on) FILTER (WHERE o.replied_on IS NOT NULL) AS avg_reply_days
      FROM outreach o
     GROUP BY 1
     ORDER BY contacted DESC, grp
     LIMIT 12`;
}

function normGroup(r: GroupRate): GroupRate {
  return {
    ...r,
    reply_rate: Number(r.reply_rate),
    avg_reply_days: num(r.avg_reply_days),
  };
}
