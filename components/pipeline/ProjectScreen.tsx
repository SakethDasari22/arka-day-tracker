"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  OUTCOME_LABEL,
  SCORE_WEIGHTS,
  STAGES,
  STATUS_LABEL,
  type OutreachOutcome,
  type ProjectDetail,
  type ProjectStatus,
  type QuoteRow,
} from "@/lib/pipeline-types";
import { daysLabel, Empty, ErrorLine, Field, fmtDate, money, Stepper, today, useMutate } from "./ui";

type M = ReturnType<typeof useMutate>;

const NEXT_STEP = [
  "Research suppliers who can make this exactly, and log each one you contact below.",
  "Log quotes as suppliers reply. Chase anyone waiting 3+ days.",
  "Compare the ranked quotes, shortlist the top three and send the best one as a sample.",
  "Mark the sample as sent once it ships to the client.",
  "Record the client's decision on the sample.",
  "Place the bulk order with the approved supplier.",
  "Add ship and delivery dates as the order moves.",
  "Delivered. This project is complete.",
];

export default function ProjectScreen({ detail }: { detail: ProjectDetail }) {
  const { project: p, outreach, quotes, samples, orders } = detail;
  const m = useMutate();
  const router = useRouter();
  const [quoteFor, setQuoteFor] = useState<number | "">("");
  const due = daysLabel(p.delivered_on ? null : p.days_to_deadline);

  async function removeProject() {
    if (!confirm(`Delete ${p.client} – ${p.product} and everything logged under it?`)) return;
    const ok = await m.remove("projects", p.id);
    if (ok !== null) router.push("/projects");
  }

  return (
    <main className="main">
      <div>
        <Link href="/projects" className="back-link">← All projects</Link>
      </div>

      <header className="row-between" style={{ alignItems: "flex-end" }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{p.client}</div>
          <h1 style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 700 }}>{p.product}</h1>
          <div className="wrap-gap" style={{ marginTop: 12, gap: 8 }}>
            <span className="chip">
              Qty: {p.quantity ? `${p.quantity.toLocaleString()} ${p.unit ?? ""}` : "TBD"}
            </span>
            {p.target_price && <span className="chip">Target: {money(p.target_price)}/unit</span>}
            <span className="chip">Received {fmtDate(p.received_on)}</span>
            <span className="chip">Deadline {fmtDate(p.deadline)}</span>
            {due.tone !== "none" && p.status === "active" && (
              <span className={`pill ${due.tone === "ok" ? "pill-todo" : due.tone === "warn" ? "pill-warn" : "pill-late"}`}>{due.text}</span>
            )}
          </div>
        </div>
        <div className="wrap-gap" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ minWidth: 140 }}>
            <label htmlFor="p-status">Status</label>
            <select
              id="p-status"
              className="select"
              value={p.status}
              onChange={(e) => m.update("projects", p.id, { status: e.target.value as ProjectStatus })}
            >
              {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn" onClick={removeProject}>Delete</button>
        </div>
      </header>

      <ErrorLine error={m.error} />

      <section className="card" aria-label="Progress">
        <Stepper dates={p as unknown as Record<string, string | null>} stageIndex={p.stage_index} />
        <div className="next-step">
          <strong>Next:</strong> {p.status === "active" ? NEXT_STEP[p.stage_index] : `Project is ${STATUS_LABEL[p.status].toLowerCase()}.`}
        </div>
      </section>

      <RequestCard detail={detail} m={m} />
      <OutreachCard detail={detail} m={m} onQuote={(id) => { setQuoteFor(id); document.getElementById("quotes")?.scrollIntoView({ behavior: "smooth" }); }} />
      <QuotesCard detail={detail} m={m} quoteFor={quoteFor} setQuoteFor={setQuoteFor} />
      <SamplesCard detail={detail} m={m} />
      <OrdersCard detail={detail} m={m} />

      {outreach.length + quotes.length + samples.length + orders.length === 0 && (
        <div className="sub">Tip: the stage tracker above fills itself in as you log suppliers, quotes, samples and the order.</div>
      )}
    </main>
  );
}

/* ------------------------------- 1. Request ------------------------------ */

function RequestCard({ detail, m }: { detail: ProjectDetail; m: M }) {
  const p = detail.project;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({
    client: p.client,
    product: p.product,
    quantity: p.quantity?.toString() ?? "",
    unit: p.unit ?? "",
    target_price: p.target_price ? String(Number(p.target_price)) : "",
    deadline: p.deadline ?? "",
    received_on: p.received_on,
    specs: p.specs ?? "",
    notes: p.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await m.update("projects", p.id, f);
    if (ok !== null) setEditing(false);
  }

  return (
    <section className="card" aria-labelledby="reqh">
      <div className="row-between">
        <div>
          <h2 id="reqh" className="section">1 · Client request</h2>
          <div className="sub">What the client needs. Arka keeps the client and supplier anonymous to each other.</div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setEditing((x) => !x)}>
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      {!editing ? (
        <>
          <p className="quote">{p.specs || "No specs written down yet."}</p>
          {p.notes && <p className="sub" style={{ fontSize: 13 }}>Notes: {p.notes}</p>}
        </>
      ) : (
        <form onSubmit={save} className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Client" id="e-client"><input id="e-client" className="input" value={f.client} onChange={(e) => set("client", e.target.value)} /></Field>
          <Field label="Product" id="e-product"><input id="e-product" className="input" value={f.product} onChange={(e) => set("product", e.target.value)} /></Field>
          <Field label="Quantity" id="e-qty"><input id="e-qty" className="input" inputMode="numeric" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} /></Field>
          <Field label="Unit" id="e-unit"><input id="e-unit" className="input" value={f.unit} onChange={(e) => set("unit", e.target.value)} /></Field>
          <Field label="Target price / unit" id="e-target"><input id="e-target" className="input" inputMode="decimal" value={f.target_price} onChange={(e) => set("target_price", e.target.value)} /></Field>
          <Field label="Deadline" id="e-deadline"><input id="e-deadline" type="date" className="input" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
          <Field label="Request received" id="e-recv"><input id="e-recv" type="date" className="input" value={f.received_on} onChange={(e) => set("received_on", e.target.value)} /></Field>
          <Field label="Specs and customization" id="e-specs" wide><textarea id="e-specs" className="input" value={f.specs} onChange={(e) => set("specs", e.target.value)} /></Field>
          <Field label="Notes" id="e-notes" wide><textarea id="e-notes" className="input" style={{ minHeight: 60 }} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
          <div style={{ gridColumn: "1 / -1" }}><button type="submit" className="btn btn-primary" disabled={m.pending}>Save</button></div>
        </form>
      )}
    </section>
  );
}

/* --------------------------- 2. Supplier outreach ------------------------ */

const OUT_EMPTY = {
  supplier: "",
  supplier_type: "Manufacturer",
  location: "",
  state: "",
  contact: "",
  email: "",
  phone: "",
  website: "",
  channel: "Email",
  contacted_on: "",
};

function OutreachCard({ detail, m, onQuote }: { detail: ProjectDetail; m: M; onQuote: (id: number) => void }) {
  const { project: p, outreach } = detail;
  const [open, setOpen] = useState(outreach.length === 0);
  const [f, setF] = useState({ ...OUT_EMPTY, contacted_on: today() });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const quoted = new Set(detail.quotes.map((q) => q.outreach_id));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    // Pull a 2-letter state out of "City, ST" if the state box was left blank.
    const state = f.state || (f.location.match(/,\s*([A-Za-z]{2})\b/)?.[1] ?? "");
    const ok = await m.create("outreach", { ...f, state: state.toUpperCase(), project_id: p.id });
    if (ok !== null) setF({ ...OUT_EMPTY, contacted_on: f.contacted_on, channel: f.channel });
  }

  return (
    <section className="card" aria-labelledby="outh">
      <div className="row-between">
        <div>
          <h2 id="outh" className="section">2 · Suppliers contacted ({outreach.length})</h2>
          <div className="sub">
            {p.suppliers_contacted
              ? `${p.suppliers_replied} of ${p.suppliers_contacted} replied · ${p.quotes_count} sent a quote`
              : "Log every supplier you reach out to, even the ones that never answer."}
          </div>
        </div>
        <div className="wrap-gap" style={{ gap: 8 }}>
          <Link className="btn btn-sm" href={`/find?project=${p.id}`}>Find suppliers</Link>
          <button type="button" className="btn btn-sm" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
            {open ? "Close" : "Add supplier"}
          </button>
        </div>
      </div>

      {open && (
        <form onSubmit={add} className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Supplier" id="o-sup"><input id="o-sup" className="input" required value={f.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Company name" /></Field>
          <Field label="Type" id="o-type">
            <select id="o-type" className="select" value={f.supplier_type} onChange={(e) => set("supplier_type", e.target.value)}>
              <option>Manufacturer</option><option>Distributor</option>
            </select>
          </Field>
          <Field label="City, state" id="o-loc"><input id="o-loc" className="input" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Joliet, IL" /></Field>
          <Field label="Sales contact" id="o-ct"><input id="o-ct" className="input" value={f.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Name, title" /></Field>
          <Field label="Email" id="o-em"><input id="o-em" className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone" id="o-ph"><input id="o-ph" className="input" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Contacted by" id="o-ch">
            <select id="o-ch" className="select" value={f.channel} onChange={(e) => set("channel", e.target.value)}>
              <option>Email</option><option>Phone</option><option>Web form</option><option>LinkedIn</option>
            </select>
          </Field>
          <Field label="Contacted on" id="o-on"><input id="o-on" type="date" className="input" value={f.contacted_on} onChange={(e) => set("contacted_on", e.target.value)} /></Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={m.pending}>Add</button>
          </div>
        </form>
      )}

      {outreach.length === 0 ? (
        !open && <Empty>No suppliers logged yet.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Location</th>
                <th>Contact</th>
                <th>Contacted</th>
                <th>Reply</th>
                <th>Replied on</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {outreach.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.supplier}</div>
                    <div className="sub">{o.supplier_type ?? ""}</div>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{o.location || o.state || "—"}</td>
                  <td>
                    <div>{o.contact || "—"}</div>
                    <div className="sub">{[o.email, o.phone].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>
                    {fmtDate(o.contacted_on)}
                    <div className="sub">{o.channel}</div>
                  </td>
                  <td>
                    <label className="visually-hidden" htmlFor={`oc-${o.id}`}>Reply from {o.supplier}</label>
                    <select
                      id={`oc-${o.id}`}
                      className="select select-sm"
                      value={o.outcome}
                      onChange={(e) => m.update("outreach", o.id, { outcome: e.target.value as OutreachOutcome })}
                    >
                      {(Object.keys(OUTCOME_LABEL) as OutreachOutcome[]).map((k) => (
                        <option key={k} value={k}>{OUTCOME_LABEL[k]}</option>
                      ))}
                    </select>
                    {o.days_waiting !== null && o.days_waiting >= 3 && (
                      <div className="sub" style={{ color: "var(--amber-ink)", fontWeight: 600 }}>Waiting {o.days_waiting}d · follow up</div>
                    )}
                  </td>
                  <td>
                    <label className="visually-hidden" htmlFor={`or-${o.id}`}>Replied on</label>
                    <input
                      id={`or-${o.id}`}
                      type="date"
                      className="input input-sm"
                      value={o.replied_on ?? ""}
                      onChange={(e) => m.update("outreach", o.id, { replied_on: e.target.value })}
                    />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {!quoted.has(o.id) && o.outcome !== "declined" && (
                      <button type="button" className="btn btn-sm" onClick={() => onQuote(o.id)}>Log quote</button>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Delete ${o.supplier}`}
                      onClick={() => confirm(`Remove ${o.supplier} (and its quote)?`) && m.remove("outreach", o.id)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------ 3. Quotes ------------------------------- */

const Q_EMPTY = {
  unit_price: "",
  moq: "",
  lead_time_days: "",
  spec_match: "3",
  shipping_cost: "",
  quoted_on: "",
  valid_until: "",
  notes: "",
};

function QuotesCard({
  detail,
  m,
  quoteFor,
  setQuoteFor,
}: {
  detail: ProjectDetail;
  m: M;
  quoteFor: number | "";
  setQuoteFor: (v: number | "") => void;
}) {
  const { project: p, quotes, outreach, samples } = detail;
  const [f, setF] = useState({ ...Q_EMPTY, quoted_on: today() });
  const [formOpen, setFormOpen] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const quotedIds = new Set(quotes.map((q) => q.outreach_id));
  const canQuote = outreach.filter((o) => !quotedIds.has(o.id) && o.outcome !== "declined");
  const sampled = new Set(samples.map((s) => s.quote_id));
  const target = p.target_price ? Number(p.target_price) : null;
  // Open when asked, when "Log quote" was clicked on a supplier, or while the
  // first quote is still missing.
  const showForm =
    canQuote.length > 0 && (formOpen || quoteFor !== "" || (quotes.length === 0 && outreach.length > 0));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (quoteFor === "") return;
    const ok = await m.create("quotes", { ...f, outreach_id: quoteFor });
    if (ok !== null) {
      setF({ ...Q_EMPTY, quoted_on: f.quoted_on });
      setQuoteFor("");
      setFormOpen(false);
    }
  }

  async function shortlistTop3() {
    for (const q of quotes) {
      const want = q.score_rank <= 3;
      if (q.shortlisted !== want) await m.update("quotes", q.id, { shortlisted: want });
    }
  }

  return (
    <section className="card" id="quotes" aria-labelledby="qh">
      <div className="row-between">
        <div>
          <h2 id="qh" className="section">3–4 · Quotes, ranked ({quotes.length})</h2>
          <div className="sub">
            Score = price {SCORE_WEIGHTS.price}% · lead time {SCORE_WEIGHTS.lead}% · spec match {SCORE_WEIGHTS.spec}% · MOQ {SCORE_WEIGHTS.moq}%.
            Price includes shipping spread over the order quantity.
          </div>
        </div>
        <div className="wrap-gap" style={{ gap: 8 }}>
          {quotes.length > 1 && (
            <button type="button" className="btn btn-sm" onClick={shortlistTop3} disabled={m.pending}>Shortlist top 3</button>
          )}
          {canQuote.length > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              aria-expanded={showForm}
              onClick={() => (showForm ? (setFormOpen(false), setQuoteFor("")) : setFormOpen(true))}
            >
              {showForm ? "Close" : "Add quote"}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={add} className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Supplier" id="q-sup">
            <select id="q-sup" className="select" required value={quoteFor} onChange={(e) => setQuoteFor(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Choose who quoted…</option>
              {canQuote.map((o) => <option key={o.id} value={o.id}>{o.supplier}</option>)}
            </select>
          </Field>
          <Field label="Unit price ($)" id="q-price"><input id="q-price" className="input" required inputMode="decimal" value={f.unit_price} onChange={(e) => set("unit_price", e.target.value)} placeholder="0.68" /></Field>
          <Field label="MOQ" id="q-moq"><input id="q-moq" className="input" inputMode="numeric" value={f.moq} onChange={(e) => set("moq", e.target.value)} placeholder="10000" /></Field>
          <Field label="Lead time (days)" id="q-lead"><input id="q-lead" className="input" inputMode="numeric" value={f.lead_time_days} onChange={(e) => set("lead_time_days", e.target.value)} placeholder="14" /></Field>
          <Field label="Spec match (1–5)" id="q-spec">
            <select id="q-spec" className="select" value={f.spec_match} onChange={(e) => set("spec_match", e.target.value)}>
              <option value="5">5 · exact match</option>
              <option value="4">4 · minor differences</option>
              <option value="3">3 · acceptable</option>
              <option value="2">2 · needs changes</option>
              <option value="1">1 · poor fit</option>
            </select>
          </Field>
          <Field label="Shipping, total ($)" id="q-ship"><input id="q-ship" className="input" inputMode="decimal" value={f.shipping_cost} onChange={(e) => set("shipping_cost", e.target.value)} placeholder="900" /></Field>
          <Field label="Quoted on" id="q-on"><input id="q-on" type="date" className="input" value={f.quoted_on} onChange={(e) => set("quoted_on", e.target.value)} /></Field>
          <Field label="Valid until" id="q-valid"><input id="q-valid" type="date" className="input" value={f.valid_until} onChange={(e) => set("valid_until", e.target.value)} /></Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={m.pending || quoteFor === ""}>Add quote</button>
          </div>
        </form>
      )}

      {quotes.length === 0 ? (
        <Empty>{outreach.length ? "No quotes yet. Add one when a supplier replies with pricing." : "Add suppliers first, then log their quotes here."}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Supplier</th>
                <th>Unit price</th>
                <th>Landed / unit</th>
                <th>MOQ</th>
                <th>Lead</th>
                <th>Spec</th>
                <th>Score</th>
                <th>Shortlist</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <QuoteLine key={q.id} q={q} m={m} qty={p.quantity} target={target} sampled={sampled.has(q.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function QuoteLine({
  q,
  m,
  qty,
  target,
  sampled,
}: {
  q: QuoteRow;
  m: M;
  qty: number | null;
  target: number | null;
  sampled: boolean;
}) {
  const score = Number(q.score);
  const over = target !== null && Number(q.effective_price) > target;
  return (
    <tr className={q.score_rank === 1 ? "row-best" : undefined}>
      <td>
        <span className={`rank${q.score_rank <= 3 ? " rank-top" : ""}`}>#{q.score_rank}</span>
      </td>
      <td>
        <div style={{ fontWeight: 600 }}>{q.supplier}</div>
        <div className="sub">
          Quoted {fmtDate(q.quoted_on)}
          {q.valid_until ? ` · valid to ${fmtDate(q.valid_until)}` : ""}
        </div>
      </td>
      <td className="num">{money(q.unit_price, 4)}</td>
      <td className="num">
        {money(q.effective_price, 4)}
        {over && <div className="sub" style={{ color: "var(--amber-ink)" }}>Over target</div>}
      </td>
      <td className="num">
        {q.moq?.toLocaleString() ?? "—"}
        {q.moq_ok === false && qty && <div className="sub" style={{ color: "var(--amber-ink)" }}>Above {qty.toLocaleString()} needed</div>}
      </td>
      <td className="num">{q.lead_time_days != null ? `${q.lead_time_days}d` : "—"}</td>
      <td className="num">{q.spec_match}/5</td>
      <td>
        <div
          className="score"
          title={`Price ${q.price_score} · Lead ${q.lead_score} · Spec ${q.spec_score} · MOQ ${q.moq_score} (each 0–1)`}
        >
          <span className="num" style={{ fontWeight: 600 }}>{score.toFixed(0)}</span>
          <span className="score-track" aria-hidden="true">
            <span className="score-fill" style={{ width: `${Math.max(2, score)}%` }} />
          </span>
        </div>
      </td>
      <td>
        <label className="check">
          <input
            type="checkbox"
            checked={q.shortlisted}
            onChange={(e) => m.update("quotes", q.id, { shortlisted: e.target.checked })}
          />
          <span className="visually-hidden">Shortlist {q.supplier}</span>
        </label>
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        {sampled ? (
          <span className="pill pill-progress">Sampled</span>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => m.create("samples", { quote_id: q.id })}>
            Send sample
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={`Delete quote from ${q.supplier}`}
          onClick={() => confirm(`Delete the quote from ${q.supplier}?`) && m.remove("quotes", q.id)}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

/* ----------------------------- 5–6. Samples ----------------------------- */

function SamplesCard({ detail, m }: { detail: ProjectDetail; m: M }) {
  const { samples, orders } = detail;
  const ordered = new Set(orders.map((o) => o.quote_id));

  return (
    <section className="card" aria-labelledby="sh">
      <h2 id="sh" className="section">5–6 · Samples and client approval</h2>
      <div className="sub">Use Send sample on a quote above to start one. The client never sees who made it.</div>
      {samples.length === 0 ? (
        <Empty>No samples yet.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Picked</th>
                <th>Sent to client</th>
                <th>Client decision</th>
                <th>Decided</th>
                <th>Client feedback</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.supplier}</div>
                    <div className="sub">{money(s.unit_price, 4)}/unit</div>
                  </td>
                  <td>{fmtDate(s.requested_on)}</td>
                  <td>
                    <label className="visually-hidden" htmlFor={`ss-${s.id}`}>Sent on</label>
                    <input id={`ss-${s.id}`} type="date" className="input input-sm" value={s.sent_on ?? ""} onChange={(e) => m.update("samples", s.id, { sent_on: e.target.value })} />
                  </td>
                  <td>
                    <label className="visually-hidden" htmlFor={`sd-${s.id}`}>Decision</label>
                    <select id={`sd-${s.id}`} className="select select-sm" value={s.decision} onChange={(e) => m.update("samples", s.id, { decision: e.target.value })}>
                      <option value="pending">Waiting on client</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </td>
                  <td>{fmtDate(s.decided_on)}</td>
                  <td>
                    <FeedbackInput
                      id={s.id}
                      value={s.feedback ?? ""}
                      onSave={(v) => m.update("samples", s.id, { feedback: v })}
                    />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {s.decision === "approved" && !ordered.has(s.quote_id) && (
                      <button type="button" className="btn btn-sm btn-green" onClick={() => m.create("orders", { quote_id: s.quote_id })}>
                        Place bulk order
                      </button>
                    )}
                    <button type="button" className="icon-btn" aria-label={`Delete sample from ${s.supplier}`} onClick={() => confirm("Delete this sample?") && m.remove("samples", s.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FeedbackInput({ id, value, onSave }: { id: number; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <>
      <label className="visually-hidden" htmlFor={`sf-${id}`}>Client feedback</label>
      <input
        id={`sf-${id}`}
        className="input input-sm"
        value={v}
        placeholder="Add a note"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
      />
    </>
  );
}

/* ------------------------------ 7. Orders ------------------------------- */

function OrdersCard({ detail, m }: { detail: ProjectDetail; m: M }) {
  const { orders, project: p } = detail;
  return (
    <section className="card" aria-labelledby="oh">
      <h2 id="oh" className="section">7 · Bulk order and delivery</h2>
      <div className="sub">Shipped straight from the supplier to the client&apos;s address.</div>
      {orders.length === 0 ? (
        <Empty>No bulk order yet. It starts from an approved sample.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Order value</th>
                <th>Ordered</th>
                <th>Shipped</th>
                <th>Delivered</th>
                <th>vs deadline</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const total = o.quantity && o.unit_price ? o.quantity * Number(o.unit_price) : null;
                const onTime = o.delivered_on && p.deadline ? o.delivered_on <= p.deadline : null;
                return (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.supplier}</td>
                    <td className="num">{o.quantity?.toLocaleString() ?? "—"}</td>
                    <td className="num">{money(o.unit_price, 4)}</td>
                    <td className="num">{money(total, 2)}</td>
                    <td>
                      <label className="visually-hidden" htmlFor={`ro-${o.id}`}>Ordered on</label>
                      <input id={`ro-${o.id}`} type="date" className="input input-sm" value={o.ordered_on} onChange={(e) => e.target.value && m.update("orders", o.id, { ordered_on: e.target.value })} />
                    </td>
                    <td>
                      <label className="visually-hidden" htmlFor={`rs-${o.id}`}>Shipped on</label>
                      <input id={`rs-${o.id}`} type="date" className="input input-sm" value={o.shipped_on ?? ""} onChange={(e) => m.update("orders", o.id, { shipped_on: e.target.value })} />
                    </td>
                    <td>
                      <label className="visually-hidden" htmlFor={`rd-${o.id}`}>Delivered on</label>
                      <input id={`rd-${o.id}`} type="date" className="input input-sm" value={o.delivered_on ?? ""} onChange={(e) => m.update("orders", o.id, { delivered_on: e.target.value })} />
                    </td>
                    <td>
                      {onTime === null ? "—" : (
                        <span className={`pill ${onTime ? "pill-done" : "pill-late"}`}>{onTime ? "On time" : "Late"}</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="icon-btn" aria-label="Delete order" onClick={() => confirm("Delete this order?") && m.remove("orders", o.id)}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="sub" style={{ marginTop: 10 }}>
        Stage {p.stage_index + 1} of {STAGES.length}: {STAGES[p.stage_index].label}
      </div>
    </section>
  );
}
