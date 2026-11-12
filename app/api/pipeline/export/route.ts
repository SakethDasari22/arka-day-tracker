import { query } from "@/lib/db";
import { isoDate } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One flat CSV of the whole pipeline at supplier-contact grain: one row per
 * supplier contacted, with that supplier's quote, sample and order (if any)
 * and the project it belongs to. Built for Power BI / Tableau / Excel pivots.
 */
export async function GET() {
  const { rows } = await query(`
    SELECT p.id AS project_id, p.client, p.product, p.quantity, p.unit,
           p.received_on::text AS received_on, p.deadline::text AS deadline, p.status AS project_status,
           o.supplier, o.supplier_type, o.state, o.channel,
           o.contacted_on::text AS contacted_on, o.replied_on::text AS replied_on, o.outcome,
           (o.replied_on - o.contacted_on) AS reply_days,
           qs.unit_price::text AS quote_unit_price, ROUND(qs.effective_price, 4)::text AS effective_price,
           qs.moq, qs.lead_time_days, qs.spec_match, qs.score::text AS score, qs.score_rank,
           qs.shortlisted, qs.quoted_on::text AS quoted_on,
           s.sent_on::text AS sample_sent_on, s.decision AS sample_decision,
           s.decided_on::text AS sample_decided_on,
           r.unit_price::text AS order_unit_price, r.quantity AS order_quantity,
           r.ordered_on::text AS ordered_on, r.delivered_on::text AS delivered_on,
           CASE WHEN r.delivered_on IS NULL OR p.deadline IS NULL THEN NULL
                ELSE r.delivered_on <= p.deadline END AS delivered_on_time
      FROM outreach o
      JOIN projects p ON p.id = o.project_id
      LEFT JOIN quote_scores qs ON qs.outreach_id = o.id
      LEFT JOIN LATERAL (
        SELECT * FROM samples s WHERE s.quote_id = qs.id ORDER BY s.id DESC LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT * FROM orders r WHERE r.quote_id = qs.id ORDER BY r.id DESC LIMIT 1
      ) r ON true
     ORDER BY p.id, o.contacted_on, o.id`);

  const headers = rows.length
    ? Object.keys(rows[0])
    : ["project_id", "client", "product", "supplier", "outcome"];
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(",")),
  ];

  return new Response("﻿" + lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sourcing-pipeline-${isoDate()}.csv"`,
    },
  });
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
