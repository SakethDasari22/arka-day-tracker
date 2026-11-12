import Link from "next/link";
import type { Analytics, GroupRate } from "@/lib/pipeline-analytics";

const pct = (v: number | null, digits = 0) => (v === null ? "—" : `${(v * 100).toFixed(digits)}%`);
const days = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}d`);
const usd = (v: number | null, d = 0) =>
  v === null ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const price = (v: number | null) =>
  v === null ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;

export default function AnalyticsScreen({ data }: { data: Analytics }) {
  const { kpis: k, funnel, stageTimes, byState, byType, prices, followUps } = data;
  const top = funnel[0]?.n || 0;
  const maxStage = Math.max(0, ...stageTimes.map((s) => s.avg_days ?? 0));
  const slowest = stageTimes.reduce<number>(
    (best, s, i) => ((s.avg_days ?? -1) > (stageTimes[best]?.avg_days ?? -1) ? i : best),
    0
  );

  if (k.projects === 0) {
    return (
      <main className="main">
        <Head />
        <div className="card empty">
          No data yet. Analytics fills in as you log projects, suppliers and quotes on the{" "}
          <Link href="/projects">Projects</Link> page.
        </div>
      </main>
    );
  }

  return (
    <main className="main">
      <Head />

      <section className="stat-grid" aria-label="Key numbers">
        <Stat label="Open projects" value={`${k.open_projects}`} note={`${k.projects} total · ${k.delivered} delivered`} />
        <Stat label="Request → bulk order" value={days(k.median_days_to_order)} note="Median, projects that ordered" />
        <Stat label="Supplier reply rate" value={pct(k.reply_rate)} note={`${k.replied} of ${k.contacted} · avg ${days(k.avg_reply_days)} to reply`} />
        <Stat label="Quote rate" value={pct(k.quote_rate)} note={`${k.quoted} of ${k.contacted} contacted sent a quote`} />
        <Stat label="Sample approval" value={pct(k.approval_rate)} note={`${k.sample_approved} of ${k.sample_decided} decided samples`} />
        <Stat
          label="#1-ranked quote approved"
          value={k.top_pick_n ? `${k.top_pick_hits}/${k.top_pick_n}` : "—"}
          note="How often the score's top pick won the client"
        />
        <Stat
          label="Savings vs median quote"
          value={pct(k.savings_pct, 1)}
          note={k.savings_n ? `${usd(k.savings_usd)} across ${k.savings_n} order${k.savings_n === 1 ? "" : "s"}` : "Needs an order with 2+ quotes"}
        />
        <Stat label="On-time delivery" value={pct(k.on_time_rate)} note={`${k.on_time_n} delivered with a deadline`} />
      </section>

      <div className="two-col">
        <section className="card" aria-labelledby="fh">
          <h2 id="fh" className="section">Supplier funnel</h2>
          <div className="sub">All projects. Percent of suppliers contacted.</div>
          <div className="bars">
            {funnel.map((f) => (
              <Bar
                key={f.label}
                label={f.label}
                value={f.n}
                max={top}
                display={`${f.n}`}
                extra={top ? pct(f.n / top) : ""}
                title={`${f.label}: ${f.n}${top ? ` (${pct(f.n / top)} of contacted)` : ""}`}
              />
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="th">
          <h2 id="th" className="section">Where the time goes</h2>
          <div className="sub">Average days between stages. The longest wait is highlighted.</div>
          <div className="bars">
            {stageTimes.map((s, i) => (
              <Bar
                key={s.label}
                label={s.label}
                value={s.avg_days ?? 0}
                max={maxStage}
                display={days(s.avg_days)}
                extra={s.n ? `n=${s.n}` : "no data"}
                highlight={i === slowest && (s.avg_days ?? 0) > 0}
                title={`${s.label}: ${days(s.avg_days)} average across ${s.n} project${s.n === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="two-col">
        <RateTable title="Reply rate by state" first="State" rows={byState} />
        <RateTable title="Reply rate by supplier type" first="Type" rows={byType} />
      </div>

      <section className="card" aria-labelledby="ph">
        <h2 id="ph" className="section">Price range by project</h2>
        <div className="sub">Unit prices quoted (before shipping) and what the client ended up paying.</div>
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Quotes</th>
                <th className="num">Lowest</th>
                <th className="num">Median</th>
                <th className="num">Highest</th>
                <th className="num">Spread</th>
                <th className="num">Ordered at</th>
              </tr>
            </thead>
            <tbody>
              {prices.length === 0 && (
                <tr><td colSpan={7} className="empty-cell">No quotes logged yet.</td></tr>
              )}
              {prices.map((r, i) => (
                <tr key={`${r.product}-${i}`}>
                  <td style={{ fontWeight: 600 }}>{r.product}</td>
                  <td className="num">{r.quotes}</td>
                  <td className="num">{price(r.min_price)}</td>
                  <td className="num">{price(r.median_price)}</td>
                  <td className="num">{price(r.max_price)}</td>
                  <td className="num">{r.min_price > 0 ? pct((r.max_price - r.min_price) / r.min_price) : "—"}</td>
                  <td className="num">{price(r.chosen_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-labelledby="uh">
        <h2 id="uh" className="section">Needs attention</h2>
        <div className="sub">Suppliers waiting 3+ days for a reply, and shortlisted quotes expiring within a week.</div>
        {followUps.length === 0 ? (
          <div className="empty">Nothing to chase right now.</div>
        ) : (
          <ul className="list">
            {followUps.map((f, i) => (
              <li key={i} className="row-between" style={{ padding: "12px 0" }}>
                <span>
                  <strong>{f.supplier}</strong>{" "}
                  <span style={{ color: "var(--muted-2)" }}>· <Link href={`/projects/${f.project_id}`}>{f.client}</Link></span>
                </span>
                <span className={`pill ${f.kind === "no_reply" ? "pill-warn" : "pill-late"}`}>
                  {f.kind === "no_reply" ? `No reply in ${f.days}d` : f.days === 0 ? "Quote expires today" : `Quote expires in ${f.days}d`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card method">
        <summary>How these numbers are calculated</summary>
        <ul>
          <li><strong>Replied</strong>: a reply date was logged, or the supplier declined, said a quote is coming, or quoted.</li>
          <li><strong>Supplier score</strong>: price, lead time and MOQ are scaled 0–1 within each project (lowest is best); spec match 1–5 is scaled 0–1. Weighted 40/25/20/15. Price includes shipping divided by the order quantity.</li>
          <li><strong>Savings</strong>: (median quoted unit price − ordered unit price) ÷ median, for projects with at least two quotes. Dollar figure multiplies by the ordered quantity.</li>
          <li><strong>Stage times</strong>: the first date each stage was reached on a project; averages only include projects that reached both ends.</li>
          <li>The SQL lives in <code>lib/pipeline-schema.ts</code> (views) and <code>lib/pipeline-analytics.ts</code>.</li>
        </ul>
      </details>
    </main>
  );
}

function Head() {
  return (
    <header className="row-between" style={{ alignItems: "flex-end" }}>
      <div className="page-head">
        <div className="eyebrow">Sourcing pipeline</div>
        <h1>Analytics</h1>
        <div className="sub" style={{ fontSize: 13 }}>
          How fast projects move, which suppliers answer, and what the comparison saves.
        </div>
      </div>
      <div className="wrap-gap">
        <Link className="btn" href="/find">Find suppliers</Link>
        <a className="btn" href="/api/pipeline/export">Export CSV for Power BI</a>
      </div>
    </header>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="note">{note}</div>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  display,
  extra,
  highlight,
  title,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  extra?: string;
  highlight?: boolean;
  title: string;
}) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div className="bar-row" title={title}>
      <div className="bar-label">{label}</div>
      <div className="bar-track" aria-hidden="true">
        <div className={`bar-fill${highlight ? " hot" : ""}`} style={{ width: `${w}%` }} />
      </div>
      <div className="bar-value">
        <span className="num">{display}</span>
        {extra && <span className="bar-extra">{extra}</span>}
      </div>
    </div>
  );
}

function RateTable({ title, first, rows }: { title: string; first: string; rows: GroupRate[] }) {
  return (
    <section className="card">
      <h2 className="section">{title}</h2>
      <div className="table-wrap">
        <table className="data" style={{ minWidth: 380 }}>
          <thead>
            <tr>
              <th>{first}</th>
              <th className="num">Contacted</th>
              <th>Replied</th>
              <th className="num">Quoted</th>
              <th className="num">Avg reply</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="empty-cell">No suppliers logged yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.grp}>
                <td style={{ fontWeight: 600 }}>{r.grp}</td>
                <td className="num">{r.contacted}</td>
                <td>
                  <div className="inline-bar" title={`${r.replied} of ${r.contacted} replied`}>
                    <span className="inline-track" aria-hidden="true">
                      <span className="inline-fill" style={{ width: `${r.reply_rate * 100}%` }} />
                    </span>
                    <span className="num">{pct(r.reply_rate)}</span>
                  </div>
                </td>
                <td className="num">{r.quoted}</td>
                <td className="num">{days(r.avg_reply_days)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
