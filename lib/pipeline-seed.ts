import type { QueryResult, QueryResultRow } from "pg";

type Raw = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

/**
 * Fake sourcing projects for the public demo. Every client and supplier name
 * here is invented: the real pipeline is blind on both sides, so real names
 * never belong in the public deployment. Dates are relative to today so the
 * demo always looks current. Runs only when the projects table is empty.
 */

interface SeedSupplier {
  name: string;
  type: "Manufacturer" | "Distributor";
  city: string;
  state: string;
  contactedAgo: number; // days ago
  repliedAfter: number | null; // days after contact
  outcome: "waiting" | "no_reply" | "declined" | "quoting" | "quoted";
  quote?: {
    price: number;
    moq: number;
    lead: number;
    spec: number;
    shipping?: number;
  };
}

interface SeedProject {
  client: string;
  product: string;
  quantity: number;
  unit: string;
  specs: string;
  target: number | null;
  receivedAgo: number;
  deadlineIn: number;
  status: "active" | "done";
  suppliers: SeedSupplier[];
  /** Index (into suppliers) of the quote sent as a sample, plus timing. */
  sample?: {
    supplier: number;
    requestedAgo: number;
    sentAgo: number | null;
    decision: "pending" | "approved" | "rejected";
    decidedAgo: number | null;
  };
  order?: { orderedAgo: number; shippedAgo: number | null; deliveredAgo: number | null };
}

const PROJECTS: SeedProject[] = [
  {
    client: "Client A (demo)",
    product: "Printed corrugated mailer boxes",
    quantity: 20000,
    unit: "boxes",
    specs: "12 x 9 x 4 in, 32 ECT kraft, 1-color logo print outside, tuck-front closure",
    target: 0.75,
    receivedAgo: 34,
    deadlineIn: -2,
    status: "done",
    suppliers: [
      { name: "Riverbend Box Co.", type: "Manufacturer", city: "Joliet", state: "IL", contactedAgo: 32, repliedAfter: 2, outcome: "quoted", quote: { price: 0.68, moq: 10000, lead: 14, spec: 5, shipping: 900 } },
      { name: "Prairie Corrugated", type: "Manufacturer", city: "Aurora", state: "IL", contactedAgo: 32, repliedAfter: 3, outcome: "quoted", quote: { price: 0.61, moq: 25000, lead: 21, spec: 4, shipping: 700 } },
      { name: "Hoosier Carton", type: "Manufacturer", city: "Gary", state: "IN", contactedAgo: 31, repliedAfter: 4, outcome: "quoted", quote: { price: 0.72, moq: 5000, lead: 10, spec: 4, shipping: 1100 } },
      { name: "Great Lakes Container", type: "Distributor", city: "Chicago", state: "IL", contactedAgo: 31, repliedAfter: 1, outcome: "quoted", quote: { price: 0.84, moq: 2000, lead: 7, spec: 3 } },
      { name: "Badger Packaging", type: "Manufacturer", city: "Milwaukee", state: "WI", contactedAgo: 31, repliedAfter: 5, outcome: "declined" },
      { name: "Fox River Paperboard", type: "Distributor", city: "Rockford", state: "IL", contactedAgo: 30, repliedAfter: null, outcome: "no_reply" },
    ],
    sample: { supplier: 0, requestedAgo: 26, sentAgo: 24, decision: "approved", decidedAgo: 19 },
    order: { orderedAgo: 18, shippedAgo: 6, deliveredAgo: 4 },
  },
  {
    client: "Client B (demo)",
    product: "Poly mailers, custom print",
    quantity: 50000,
    unit: "mailers",
    specs: "10 x 13 in, 2.5 mil co-ex, white/grey, 2-color print, self-seal strip",
    target: 0.09,
    receivedAgo: 22,
    deadlineIn: 18,
    status: "active",
    suppliers: [
      { name: "Lakeside Poly", type: "Manufacturer", city: "Elgin", state: "IL", contactedAgo: 21, repliedAfter: 1, outcome: "quoted", quote: { price: 0.082, moq: 25000, lead: 18, spec: 5, shipping: 400 } },
      { name: "Summit Flexible Packaging", type: "Manufacturer", city: "Dallas", state: "TX", contactedAgo: 21, repliedAfter: 2, outcome: "quoted", quote: { price: 0.071, moq: 100000, lead: 30, spec: 4, shipping: 950 } },
      { name: "Coastline Mailers", type: "Distributor", city: "Ontario", state: "CA", contactedAgo: 20, repliedAfter: 3, outcome: "quoted", quote: { price: 0.095, moq: 10000, lead: 9, spec: 3, shipping: 1200 } },
      { name: "Keystone Bag Works", type: "Manufacturer", city: "Allentown", state: "PA", contactedAgo: 20, repliedAfter: null, outcome: "no_reply" },
      { name: "Gulf Coast Plastics", type: "Manufacturer", city: "Houston", state: "TX", contactedAgo: 19, repliedAfter: 2, outcome: "declined" },
    ],
    sample: { supplier: 0, requestedAgo: 15, sentAgo: 13, decision: "approved", decidedAgo: 8 },
    order: { orderedAgo: 6, shippedAgo: null, deliveredAgo: null },
  },
  {
    client: "Client C (demo)",
    product: "Triangular mailing tubes",
    quantity: 8000,
    unit: "tubes",
    specs: "24 in length, 4 in face, white SBS board, auto-lock ends, full-color print",
    target: 1.2,
    receivedAgo: 14,
    deadlineIn: 24,
    status: "active",
    suppliers: [
      { name: "Pinecrest Tube & Core", type: "Manufacturer", city: "Charlotte", state: "NC", contactedAgo: 13, repliedAfter: 2, outcome: "quoted", quote: { price: 1.14, moq: 5000, lead: 20, spec: 5, shipping: 650 } },
      { name: "Allied Paper Tubes", type: "Manufacturer", city: "Columbus", state: "OH", contactedAgo: 13, repliedAfter: 3, outcome: "quoted", quote: { price: 0.98, moq: 10000, lead: 25, spec: 3, shipping: 800 } },
      { name: "Mesa Display Packaging", type: "Manufacturer", city: "Phoenix", state: "AZ", contactedAgo: 12, repliedAfter: 4, outcome: "quoted", quote: { price: 1.29, moq: 2500, lead: 12, spec: 4, shipping: 1300 } },
      { name: "Northstar Converting", type: "Distributor", city: "Minneapolis", state: "MN", contactedAgo: 12, repliedAfter: null, outcome: "no_reply" },
    ],
    sample: { supplier: 0, requestedAgo: 7, sentAgo: 5, decision: "pending", decidedAgo: null },
  },
  {
    client: "Client D (demo)",
    product: "Bubble mailers, kraft",
    quantity: 30000,
    unit: "mailers",
    specs: "#2 size (8.5 x 12 in), kraft outer, recyclable padding, peel-and-seal",
    target: null,
    receivedAgo: 4,
    deadlineIn: 35,
    status: "active",
    suppliers: [
      { name: "Carolina Mailer Supply", type: "Distributor", city: "Indian Trail", state: "NC", contactedAgo: 3, repliedAfter: 1, outcome: "quoted", quote: { price: 0.21, moq: 5000, lead: 8, spec: 4, shipping: 500 } },
      { name: "Evergreen Eco Pack", type: "Manufacturer", city: "Portland", state: "OR", contactedAgo: 3, repliedAfter: 2, outcome: "quoting" },
      { name: "Heartland Envelope", type: "Manufacturer", city: "Des Moines", state: "IA", contactedAgo: 2, repliedAfter: null, outcome: "waiting" },
      { name: "Tri-State Packaging", type: "Distributor", city: "Secaucus", state: "NJ", contactedAgo: 2, repliedAfter: null, outcome: "waiting" },
    ],
  },
];

export async function seedDemoPipeline(raw: Raw): Promise<void> {
  const existing = await raw<{ n: string }>(`SELECT count(*) AS n FROM projects`);
  if (Number(existing.rows[0]?.n ?? 0) > 0) return;

  for (const p of PROJECTS) {
    const { rows } = await raw<{ id: number }>(
      `INSERT INTO projects (client, product, quantity, unit, specs, target_price, deadline, received_on, status)
       VALUES ($1,$2,$3,$4,$5,$6, CURRENT_DATE + $7::int, CURRENT_DATE - $8::int, $9)
       RETURNING id`,
      [p.client, p.product, p.quantity, p.unit, p.specs, p.target, p.deadlineIn, p.receivedAgo, p.status]
    );
    const projectId = rows[0].id;
    const quoteIds: (number | null)[] = [];

    for (const s of p.suppliers) {
      const o = await raw<{ id: number }>(
        `INSERT INTO outreach (project_id, supplier, supplier_type, location, state, contact, email, channel,
                               contacted_on, replied_on, outcome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Email', CURRENT_DATE - $8::int,
                 CASE WHEN $9::int IS NULL THEN NULL ELSE CURRENT_DATE - $8::int + $9::int END, $10)
         RETURNING id`,
        [
          projectId,
          s.name,
          s.type,
          `${s.city}, ${s.state}`,
          s.state,
          "Sales desk (demo)",
          "sales@example.com",
          s.contactedAgo,
          s.repliedAfter,
          s.outcome,
        ]
      );
      if (s.quote) {
        const q = await raw<{ id: number }>(
          `INSERT INTO quotes (project_id, outreach_id, unit_price, moq, lead_time_days, spec_match,
                               shipping_cost, quoted_on, valid_until, shortlisted)
           VALUES ($1,$2,$3,$4,$5,$6,$7, CURRENT_DATE - $8::int + $9::int,
                   CURRENT_DATE - $8::int + $9::int + 30, false)
           RETURNING id`,
          [
            projectId,
            o.rows[0].id,
            s.quote.price,
            s.quote.moq,
            s.quote.lead,
            s.quote.spec,
            s.quote.shipping ?? null,
            s.contactedAgo,
            s.repliedAfter ?? 0,
          ]
        );
        quoteIds.push(q.rows[0].id);
      } else {
        quoteIds.push(null);
      }
    }

    // Shortlist the top three by score, like the real step 4.
    await raw(
      `UPDATE quotes SET shortlisted = true
        WHERE id IN (SELECT id FROM quote_scores WHERE project_id = $1 AND score_rank <= 3)`,
      [projectId]
    );

    if (p.sample) {
      const quoteId = quoteIds[p.sample.supplier];
      if (quoteId == null) continue;
      await raw(
        `INSERT INTO samples (project_id, quote_id, requested_on, sent_on, decision, decided_on, feedback)
         VALUES ($1,$2, CURRENT_DATE - $3::int,
                 CASE WHEN $4::int IS NULL THEN NULL ELSE CURRENT_DATE - $4::int END,
                 $5,
                 CASE WHEN $6::int IS NULL THEN NULL ELSE CURRENT_DATE - $6::int END,
                 $7)`,
        [
          projectId,
          quoteId,
          p.sample.requestedAgo,
          p.sample.sentAgo,
          p.sample.decision,
          p.sample.decidedAgo,
          p.sample.decision === "approved" ? "Print quality and fit approved by client" : null,
        ]
      );
      if (p.order) {
        const sup = p.suppliers[p.sample.supplier];
        await raw(
          `INSERT INTO orders (project_id, quote_id, quantity, unit_price, ordered_on, shipped_on, delivered_on)
           VALUES ($1,$2,$3,$4, CURRENT_DATE - $5::int,
                   CASE WHEN $6::int IS NULL THEN NULL ELSE CURRENT_DATE - $6::int END,
                   CASE WHEN $7::int IS NULL THEN NULL ELSE CURRENT_DATE - $7::int END)`,
          [
            projectId,
            quoteId,
            p.quantity,
            sup.quote?.price ?? null,
            p.order.orderedAgo,
            p.order.shippedAgo,
            p.order.deliveredAgo,
          ]
        );
      }
    }
  }
}
