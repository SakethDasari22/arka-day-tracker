"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { Assignment, SupplierType, SupplierView } from "@/lib/types";

type Filter = "all" | "missing" | "dist";

const EMPTY_FORM = {
  company: "",
  type: "Manufacturer" as SupplierType,
  contact: "",
  email: "",
  phone: "",
  website: "",
  location: "",
};

export default function ResearchScreen({
  assignment,
  suppliers: initial,
}: {
  assignment: Assignment | null;
  suppliers: SupplierView[];
}) {
  const [suppliers, setSuppliers] = useState<SupplierView[]>(initial);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");

  const missingCount = suppliers.filter((s) => !s.complete).length;

  const rows = useMemo(() => {
    if (filter === "missing") return suppliers.filter((s) => !s.complete);
    if (filter === "dist") return suppliers.filter((s) => s.type === "Distributor");
    return suppliers;
  }, [suppliers, filter]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company.trim()) return;
    try {
      const created = await api<SupplierView>("/api/suppliers", {
        method: "POST",
        body: form,
      });
      // The API returns the row; derive `complete` the same way the server does.
      const row: SupplierView = {
        ...created,
        complete: Boolean(created.email && created.phone),
      };
      setSuppliers((s) => [row, ...s]);
      setForm({ ...EMPTY_FORM });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    }
  }

  async function remove(id: number) {
    setSuppliers((s) => s.filter((r) => r.id !== id));
    try {
      await api(`/api/suppliers/${id}`, { method: "DELETE" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <main className="main">
      <header className="row-between" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">Assignment from Allan</div>
          <h1 style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 700 }}>
            {assignment?.title ?? "Supplier research"}
          </h1>
          <div className="wrap-gap" style={{ marginTop: 12, gap: 8 }}>
            {assignment?.area && <span className="chip">Area: {assignment.area}</span>}
            {assignment?.material && <span className="chip">Material: {assignment.material}</span>}
            {assignment?.need && <span className="chip">Need: {assignment.need}</span>}
          </div>
        </div>
        <div className="wrap-gap">
          <a className="btn" href="/api/export">
            Download CSV
          </a>
          <button
            type="button"
            className="btn"
            title="Direct Google Sheets sync comes in the next version"
            disabled
            style={{ opacity: 0.55, cursor: "not-allowed" }}
          >
            Send to Google Sheet (soon)
          </button>
        </div>
      </header>

      {error && (
        <div style={{ color: "var(--red)", fontSize: 13 }} role="alert">
          {error}
        </div>
      )}

      {/* Add a supplier */}
      <section className="card" aria-labelledby="addh">
        <h2 id="addh" className="section">Add a supplier</h2>
        <form
          onSubmit={add}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          <Field label="Company" id="f-co">
            <input id="f-co" className="input" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" />
          </Field>
          <Field label="Type" id="f-type">
            <select id="f-type" className="select" value={form.type} onChange={(e) => set("type", e.target.value as SupplierType)}>
              <option>Manufacturer</option>
              <option>Distributor</option>
            </select>
          </Field>
          <Field label="Sales contact" id="f-ct">
            <input id="f-ct" className="input" value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Name, title" />
          </Field>
          <Field label="Email" id="f-em">
            <input id="f-em" className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" />
          </Field>
          <Field label="Phone" id="f-ph">
            <input id="f-ph" className="input" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(000) 000-0000" />
          </Field>
          <Field label="Website" id="f-web">
            <input id="f-web" className="input" type="text" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="company.com" />
          </Field>
          <Field label="City, state" id="f-loc">
            <input id="f-loc" className="input" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Joliet, IL" />
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
              Add to list
            </button>
          </div>
        </form>
      </section>

      {/* List */}
      <section className="card" aria-labelledby="listh">
        <div className="row-between">
          <div>
            <h2 id="listh" className="section">Suppliers found ({suppliers.length})</h2>
            <div className="sub">
              {missingCount
                ? `${missingCount} still need an email or phone before you send the sheet`
                : suppliers.length
                ? "Every supplier has an email and phone"
                : "No suppliers yet — add your first one above"}
            </div>
          </div>
          <div role="group" aria-label="Filter" className="wrap-gap" style={{ gap: 6 }}>
            {([
              ["all", "All"],
              ["missing", "Missing info"],
              ["dist", "Distributors"],
            ] as [Filter, string][]).map(([id, label]) => {
              const on = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(id)}
                  className="btn btn-sm"
                  style={{
                    borderRadius: 999,
                    minHeight: 36,
                    ...(on
                      ? { background: "var(--ink)", borderColor: "var(--ink)", color: "#fff" }
                      : {}),
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Company</th>
                <th>Type</th>
                <th>Sales contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Website</th>
                <th>Location</th>
                <th>Status</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ color: "var(--muted-2)", padding: "18px 10px" }}>
                    Nothing to show for this filter.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.company}</td>
                  <td style={{ color: "var(--muted)" }}>{r.type}</td>
                  <td>{r.contact || <span className="missing">—</span>}</td>
                  <td className={r.email ? "" : "missing"}>{r.email || "Missing"}</td>
                  <td style={{ fontFamily: "var(--mono)", fontSize: 12 }} className={r.phone ? "" : "missing"}>
                    {r.phone || "Missing"}
                  </td>
                  <td>
                    {r.website ? (
                      <a href={toHref(r.website)} target="_blank" rel="noreferrer">
                        {r.website}
                      </a>
                    ) : (
                      <span className="missing">—</span>
                    )}
                  </td>
                  <td style={{ color: "var(--muted)" }}>{r.location || "—"}</td>
                  <td>
                    <span className={`pill ${r.complete ? "pill-done" : "pill-warn"}`}>
                      {r.complete ? "Complete" : "Needs contact"}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Delete ${r.company}`}
                      onClick={() => remove(r.id)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function toHref(web: string): string {
  return /^https?:\/\//i.test(web) ? web : `https://${web}`;
}
