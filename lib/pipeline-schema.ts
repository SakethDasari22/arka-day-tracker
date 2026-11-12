/**
 * Schema for the sourcing pipeline. Every statement is idempotent, so it runs
 * safely on every cold start. The same SQL is mirrored in sql/pipeline.sql for
 * reading on GitHub.
 *
 * Tables follow the project lifecycle one-to-many:
 *   projects -> outreach (one row per supplier contacted)
 *            -> quotes   (one per quoting supplier)
 *            -> samples  (one per quote sent to the client)
 *            -> orders   (the bulk order)
 */

export const PIPELINE_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
     id SERIAL PRIMARY KEY,
     client TEXT NOT NULL,
     product TEXT NOT NULL,
     quantity INT,
     unit TEXT,
     specs TEXT,
     target_price NUMERIC(12,4),
     deadline DATE,
     received_on DATE NOT NULL DEFAULT CURRENT_DATE,
     status TEXT NOT NULL DEFAULT 'active',
     notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS outreach (
     id SERIAL PRIMARY KEY,
     project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     supplier TEXT NOT NULL,
     supplier_type TEXT,
     location TEXT,
     state TEXT,
     contact TEXT,
     email TEXT,
     phone TEXT,
     website TEXT,
     channel TEXT DEFAULT 'Email',
     contacted_on DATE NOT NULL DEFAULT CURRENT_DATE,
     replied_on DATE,
     outcome TEXT NOT NULL DEFAULT 'waiting',
     notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS quotes (
     id SERIAL PRIMARY KEY,
     project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     outreach_id INT NOT NULL REFERENCES outreach(id) ON DELETE CASCADE,
     unit_price NUMERIC(12,4) NOT NULL,
     moq INT,
     lead_time_days INT,
     spec_match INT NOT NULL DEFAULT 3,
     shipping_cost NUMERIC(12,2),
     quoted_on DATE NOT NULL DEFAULT CURRENT_DATE,
     valid_until DATE,
     shortlisted BOOLEAN NOT NULL DEFAULT false,
     notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS samples (
     id SERIAL PRIMARY KEY,
     project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     quote_id INT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
     requested_on DATE NOT NULL DEFAULT CURRENT_DATE,
     sent_on DATE,
     decision TEXT NOT NULL DEFAULT 'pending',
     decided_on DATE,
     feedback TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS orders (
     id SERIAL PRIMARY KEY,
     project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     quote_id INT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
     quantity INT,
     unit_price NUMERIC(12,4),
     ordered_on DATE NOT NULL DEFAULT CURRENT_DATE,
     shipped_on DATE,
     delivered_on DATE,
     tracking TEXT,
     notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS outreach_project_idx ON outreach(project_id)`,
  `CREATE INDEX IF NOT EXISTS quotes_project_idx ON quotes(project_id)`,
  `CREATE INDEX IF NOT EXISTS samples_project_idx ON samples(project_id)`,
  `CREATE INDEX IF NOT EXISTS orders_project_idx ON orders(project_id)`,
];

/** Bump when a view below changes so existing databases rebuild it. */
export const PIPELINE_VIEWS_VERSION = "1";

/**
 * Views carry the analysis logic, so the same numbers show up in the app, in
 * the CSV export and in Power BI. Dropped and recreated each time the version
 * changes so a change to a view's columns never blocks deployment.
 */
export const PIPELINE_VIEWS: string[] = [
  `DROP VIEW IF EXISTS project_timeline`,
  `DROP VIEW IF EXISTS quote_scores`,

  // One row per project with the date each stage was first reached.
  `CREATE VIEW project_timeline AS
   SELECT p.*,
     (SELECT min(o.contacted_on) FROM outreach o WHERE o.project_id = p.id) AS first_contact_on,
     (SELECT min(q.quoted_on)    FROM quotes q   WHERE q.project_id = p.id) AS first_quote_on,
     (SELECT min(s.requested_on) FROM samples s  WHERE s.project_id = p.id) AS sample_requested_on,
     (SELECT min(s.sent_on)      FROM samples s  WHERE s.project_id = p.id) AS sample_sent_on,
     (SELECT min(s.decided_on)   FROM samples s  WHERE s.project_id = p.id AND s.decision = 'approved') AS approved_on,
     (SELECT min(r.ordered_on)   FROM orders r   WHERE r.project_id = p.id) AS ordered_on,
     (SELECT max(r.delivered_on) FROM orders r   WHERE r.project_id = p.id) AS delivered_on,
     (SELECT count(*) FROM outreach o WHERE o.project_id = p.id)::int AS suppliers_contacted,
     (SELECT count(*) FROM outreach o WHERE o.project_id = p.id
        AND (o.replied_on IS NOT NULL OR o.outcome IN ('declined','quoting','quoted')))::int AS suppliers_replied,
     (SELECT count(*) FROM quotes q WHERE q.project_id = p.id)::int AS quotes_count
   FROM projects p`,

  // Weighted supplier score per quote, ranked within its project.
  // Price, lead time and MOQ are min-max scaled inside the project (lower is
  // better); spec match is the 1-5 rating scaled to 0-1. Missing values score
  // a neutral 0.5 so a quote isn't punished for a blank.
  `CREATE VIEW quote_scores AS
   WITH base AS (
     SELECT q.*,
            o.supplier, o.state, o.supplier_type,
            p.quantity AS project_qty,
            q.unit_price + COALESCE(q.shipping_cost, 0) / NULLIF(p.quantity, 0) AS effective_price
       FROM quotes q
       JOIN outreach o ON o.id = q.outreach_id
       JOIN projects p ON p.id = q.project_id
   ),
   bounds AS (
     SELECT b.*,
       min(effective_price) OVER w AS p_min, max(effective_price) OVER w AS p_max,
       min(lead_time_days)  OVER w AS l_min, max(lead_time_days)  OVER w AS l_max,
       min(moq)             OVER w AS m_min, max(moq)             OVER w AS m_max
     FROM base b
     WINDOW w AS (PARTITION BY project_id)
   ),
   scored AS (
     SELECT bounds.*,
       CASE WHEN p_max = p_min THEN 1
            ELSE (p_max - effective_price) / (p_max - p_min) END AS price_score,
       CASE WHEN lead_time_days IS NULL THEN 0.5
            WHEN l_max = l_min THEN 1
            ELSE (l_max - lead_time_days)::numeric / (l_max - l_min) END AS lead_score,
       CASE WHEN moq IS NULL THEN 0.5
            WHEN m_max = m_min THEN 1
            ELSE (m_max - moq)::numeric / (m_max - m_min) END AS moq_score,
       (LEAST(GREATEST(spec_match, 1), 5) - 1) / 4.0 AS spec_score,
       CASE WHEN moq IS NULL OR project_qty IS NULL THEN NULL
            ELSE moq <= project_qty END AS moq_ok
     FROM bounds
   )
   SELECT scored.*,
     ROUND(100 * (0.40 * price_score + 0.25 * lead_score
                + 0.20 * spec_score  + 0.15 * moq_score), 1) AS score,
     RANK() OVER (PARTITION BY project_id
                  ORDER BY 0.40 * price_score + 0.25 * lead_score
                         + 0.20 * spec_score  + 0.15 * moq_score DESC,
                           effective_price ASC)::int AS score_rank
   FROM scored`,
];
