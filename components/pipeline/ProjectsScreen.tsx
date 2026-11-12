"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STAGES, STATUS_LABEL, type ProjectRow } from "@/lib/pipeline-types";
import { daysLabel, ErrorLine, Field, Stepper, today, useMutate } from "./ui";

const EMPTY = {
  client: "",
  product: "",
  quantity: "",
  unit: "",
  specs: "",
  target_price: "",
  deadline: "",
  received_on: "",
};

export default function ProjectsScreen({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const m = useMutate();
  const [open, setOpen] = useState(projects.length === 0);
  const [form, setForm] = useState({ ...EMPTY, received_on: today() });
  const [show, setShow] = useState<"open" | "all">("open");

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = (await m.create("projects", form)) as { id: number } | null;
    if (res) router.push(`/projects/${res.id}`);
  }

  const openCount = projects.filter((p) => p.status === "active" || p.status === "on_hold").length;
  const rows = show === "open" ? projects.filter((p) => p.status === "active" || p.status === "on_hold") : projects;

  return (
    <main className="main">
      <header className="row-between" style={{ alignItems: "flex-end" }}>
        <div className="page-head">
          <div className="eyebrow">Sourcing pipeline</div>
          <h1>Projects</h1>
          <div className="sub" style={{ fontSize: 13 }}>
            Every client request, from supplier research to delivery.
          </div>
        </div>
        <div className="wrap-gap">
          <a className="btn" href="/api/pipeline/export">Export for Power BI</a>
          <button type="button" className="btn btn-primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Close" : "New project"}
          </button>
        </div>
      </header>

      {open && (
        <section className="card" aria-labelledby="newh">
          <h2 id="newh" className="section">New client request</h2>
          <div className="sub">What the client asked for. You can edit any of this later.</div>
          <form onSubmit={add} className="form-grid" style={{ marginTop: 14 }}>
            <Field label="Client (use a code for anything public)" id="n-client">
              <input id="n-client" className="input" required value={form.client} onChange={(e) => set("client", e.target.value)} placeholder="Client A" />
            </Field>
            <Field label="Product" id="n-product">
              <input id="n-product" className="input" required value={form.product} onChange={(e) => set("product", e.target.value)} placeholder="Corrugated mailer boxes" />
            </Field>
            <Field label="Quantity" id="n-qty">
              <input id="n-qty" className="input" inputMode="numeric" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="20000" />
            </Field>
            <Field label="Unit" id="n-unit">
              <input id="n-unit" className="input" value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="boxes" />
            </Field>
            <Field label="Target price / unit (optional)" id="n-target">
              <input id="n-target" className="input" inputMode="decimal" value={form.target_price} onChange={(e) => set("target_price", e.target.value)} placeholder="0.75" />
            </Field>
            <Field label="Client deadline" id="n-deadline">
              <input id="n-deadline" className="input" type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
            </Field>
            <Field label="Request received" id="n-recv">
              <input id="n-recv" className="input" type="date" value={form.received_on} onChange={(e) => set("received_on", e.target.value)} />
            </Field>
            <Field label="Specs and customization" id="n-specs" wide>
              <textarea id="n-specs" className="input" value={form.specs} onChange={(e) => set("specs", e.target.value)} placeholder="Size, material, print, closure, packing…" />
            </Field>
            <div style={{ gridColumn: "1 / -1" }} className="wrap-gap">
              <button type="submit" className="btn btn-primary" disabled={m.pending}>Create project</button>
            </div>
          </form>
          <ErrorLine error={m.error} />
        </section>
      )}

      <section aria-labelledby="listh">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 id="listh" className="section">
            {show === "open" ? `Open projects (${openCount})` : `All projects (${projects.length})`}
          </h2>
          <div role="group" aria-label="Show" className="wrap-gap" style={{ gap: 6 }}>
            {(["open", "all"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={show === k}
                onClick={() => setShow(k)}
                className={`btn btn-sm toggle${show === k ? " on" : ""}`}
              >
                {k === "open" ? "Open" : "All"}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 && (
          <div className="card empty">
            {projects.length === 0
              ? "No projects yet. When Allan assigns a new client request, add it with New project."
              : "No open projects. Switch to All to see finished ones."}
          </div>
        )}

        <div className="project-list">
          {rows.map((p) => {
            const due = daysLabel(p.status === "done" || p.delivered_on ? null : p.days_to_deadline);
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="card project-card">
                <div className="row-between" style={{ alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="eyebrow">{p.client}</div>
                    <div className="project-title">{p.product}</div>
                    <div className="sub">
                      {p.quantity ? `${p.quantity.toLocaleString()} ${p.unit ?? "units"}` : "Quantity TBD"}
                    </div>
                  </div>
                  <div className="wrap-gap" style={{ gap: 6, justifyContent: "flex-end" }}>
                    {p.status !== "active" && (
                      <span className={`pill ${p.status === "done" ? "pill-done" : "pill-todo"}`}>{STATUS_LABEL[p.status]}</span>
                    )}
                    {p.status === "active" && due.tone !== "none" && (
                      <span className={`pill ${due.tone === "ok" ? "pill-todo" : due.tone === "warn" ? "pill-warn" : "pill-late"}`}>{due.text}</span>
                    )}
                  </div>
                </div>
                <Stepper dates={p as unknown as Record<string, string | null>} stageIndex={p.stage_index} compact />
                <div className="row-between" style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>
                    Stage {p.stage_index + 1} of {STAGES.length}: {STAGES[p.stage_index].label}
                  </span>
                  <span style={{ color: "var(--muted-2)" }}>
                    {p.suppliers_contacted} contacted · {p.suppliers_replied} replied · {p.quotes_count} quote{p.quotes_count === 1 ? "" : "s"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
