"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import {
  RADIUS_OPTIONS,
  type FinderEvent,
  type FinderResult,
  type SavedSearch,
} from "@/lib/finder-types";
import { ErrorLine, Field } from "./ui";

export interface FinderProject {
  id: number;
  client: string;
  product: string;
  specs: string | null;
}

interface Progress {
  origin: string;
  queries: string[];
  candidates: { total: number; inRange: number } | null;
  checking: string[];
  found: number;
  dropped: { company: string; reason: string }[];
  status: string;
}

const EMPTY_PROGRESS: Progress = {
  origin: "",
  queries: [],
  candidates: null,
  checking: [],
  found: 0,
  dropped: [],
  status: "",
};

export default function FinderScreen({
  searches: initialSearches,
  projects,
  configured,
  allowed,
  preset,
}: {
  searches: SavedSearch[];
  projects: FinderProject[];
  configured: boolean;
  allowed: boolean;
  preset: { projectId: number | null; searchId: number | null };
}) {
  const router = useRouter();
  const presetProject = projects.find((p) => p.id === preset.projectId) ?? null;
  const [form, setForm] = useState({
    product: presetProject?.product ?? "",
    dimensions: presetProject?.specs ?? "",
    zip: "",
    radius: 100,
    count: 10,
    projectId: presetProject ? String(presetProject.id) : "",
  });
  const [searches, setSearches] = useState(initialSearches);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [live, setLive] = useState<FinderResult[]>([]);
  const [view, setView] = useState<SavedSearch | null>(
    initialSearches.find((s) => s.id === preset.searchId) ?? (preset.projectId ? null : initialSearches[0] ?? null)
  );
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [addTo, setAddTo] = useState(presetProject ? String(presetProject.id) : "");
  const [adding, setAdding] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function chooseProject(id: string) {
    set("projectId", id);
    setAddTo(id);
    const p = projects.find((x) => String(x.id) === id);
    if (p) {
      setForm((f) => ({
        ...f,
        projectId: id,
        product: f.product || p.product,
        dimensions: f.dimensions || p.specs || "",
      }));
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSummary("");
    setLive([]);
    setView(null);
    setPicked(new Set());
    setProgress({ ...EMPTY_PROGRESS, status: "Starting…" });
    setRunning(true);
    try {
      const res = await fetch("/api/finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, projectId: form.projectId || null }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Search failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as FinderEvent;
          if (ev.type === "done" || ev.type === "error") finished = true;
          handle(ev);
        }
      }
      if (!finished) throw new Error("The connection closed before the search finished. Partial results are saved below if any were found.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setRunning(false);
      // Refresh the saved-search list.
      api<{ searches: SavedSearch[] }>("/api/finder").then((r) => setSearches(r.searches)).catch(() => {});
    }
  }

  function handle(ev: FinderEvent) {
    switch (ev.type) {
      case "status":
        if (ev.text) setProgress((p) => ({ ...p, status: ev.text }));
        break;
      case "origin":
        setProgress((p) => ({ ...p, origin: `${ev.city}, ${ev.state}` }));
        break;
      case "search":
        setProgress((p) => ({ ...p, queries: [...p.queries, ev.query] }));
        break;
      case "candidates":
        setProgress((p) => ({
          ...p,
          candidates: { total: ev.total, inRange: ev.inRange },
          status: `Found ${ev.total} companies, ${ev.inRange} in range. Checking each one's website…`,
        }));
        break;
      case "checking":
        setProgress((p) => ({ ...p, checking: [...p.checking, ev.company] }));
        break;
      case "result":
        setLive((r) => [...r, ev.result]);
        setProgress((p) => ({ ...p, found: p.found + 1 }));
        break;
      case "dropped":
        setProgress((p) => ({ ...p, dropped: [...p.dropped, { company: ev.company, reason: ev.reason }] }));
        break;
      case "done":
        setLive(ev.results);
        setSummary(ev.summary);
        break;
      case "error":
        setError(ev.text);
        break;
    }
  }

  const rows: FinderResult[] = useMemo(() => {
    const list = view ? view.results : live;
    return [...list].sort(
      (a, b) =>
        Number(b.product_available === "yes") - Number(a.product_available === "yes") ||
        (a.distance_miles ?? 1e9) - (b.distance_miles ?? 1e9)
    );
  }, [view, live]);

  const header = view
    ? `${view.product} · ${view.zip} · ${view.radius_miles} mi`
    : running
    ? "Results so far"
    : "Results";

  function toggle(i: number) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  async function addToProject() {
    if (!addTo || picked.size === 0) return;
    setAdding(true);
    setError("");
    try {
      let n = 0;
      for (const i of [...picked].sort((a, b) => a - b)) {
        const r = rows[i];
        await api("/api/pipeline/outreach", {
          method: "POST",
          body: {
            project_id: Number(addTo),
            supplier: r.company,
            supplier_type: r.type || null,
            location: [r.city, r.state].filter(Boolean).join(", "),
            state: r.state,
            contact: [r.contact_person, r.contact_title].filter(Boolean).join(", "),
            email: r.email,
            phone: r.phone,
            website: r.website,
            channel: r.email ? "Email" : r.phone ? "Phone" : "Web form",
            notes: "Added from supplier finder",
          },
        });
        n++;
      }
      setPicked(new Set());
      const proj = projects.find((p) => String(p.id) === addTo);
      setNotice(`Added ${n} supplier${n === 1 ? "" : "s"} to ${proj ? `${proj.client} – ${proj.product}` : "the project"}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add to the project");
    } finally {
      setAdding(false);
    }
  }

  async function removeSearch(id: number) {
    if (!confirm("Delete this saved search?")) return;
    await api(`/api/finder/${id}`, { method: "DELETE" }).catch(() => {});
    setSearches((s) => s.filter((x) => x.id !== id));
    if (view?.id === id) setView(null);
  }

  const canRun = configured && allowed;

  return (
    <main className="main">
      <header className="row-between" style={{ alignItems: "flex-end" }}>
        <div className="page-head">
          <div className="eyebrow">Supplier research</div>
          <h1>Find suppliers</h1>
          <div className="sub" style={{ fontSize: 13 }}>
            Searches the web near a ZIP, opens each company&apos;s site, and returns only contacts it could read there.
          </div>
        </div>
        <Link className="btn" href="/analytics">Analytics</Link>
      </header>

      {!configured && (
        <div className="setup-note">
          <strong>Live search needs an Anthropic API key.</strong> Add <code>ANTHROPIC_API_KEY</code> in Vercel →
          Settings → Environment Variables (or your <code>.env</code> on the Mac Mini), then redeploy.
        </div>
      )}
      {configured && !allowed && (
        <div className="setup-note">
          <strong>Live search is off on this public demo</strong> so strangers can&apos;t spend your API credits.
          It runs on your password-protected copy. The search below is sample data.
        </div>
      )}

      <section className="card" aria-labelledby="fh">
        <h2 id="fh" className="section">What are you looking for?</h2>
        <form onSubmit={run} className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Product" id="f-product">
            <input id="f-product" className="input" required value={form.product} onChange={(e) => set("product", e.target.value)} placeholder="Corrugated mailer boxes" />
          </Field>
          <Field label="Dimensions / specs (optional)" id="f-dims">
            <input id="f-dims" className="input" value={form.dimensions} onChange={(e) => set("dimensions", e.target.value)} placeholder="12 x 9 x 4 in, 32 ECT, 1-color print" />
          </Field>
          <Field label="ZIP code" id="f-zip">
            <input id="f-zip" className="input" required inputMode="numeric" pattern="\d{5}" maxLength={5} value={form.zip} onChange={(e) => set("zip", e.target.value.replace(/\D/g, ""))} placeholder="60446" />
          </Field>
          <Field label="Radius" id="f-radius">
            <select id="f-radius" className="select" value={form.radius} onChange={(e) => set("radius", Number(e.target.value))}>
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>{r.toLocaleString()} miles</option>
              ))}
            </select>
          </Field>
          <Field label="How many suppliers" id="f-count">
            <select id="f-count" className="select" value={form.count} onChange={(e) => set("count", Number(e.target.value))}>
              {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="For project (optional)" id="f-proj">
            <select id="f-proj" className="select" value={form.projectId} onChange={(e) => chooseProject(e.target.value)}>
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.client} – {p.product}</option>)}
            </select>
          </Field>
          <div style={{ gridColumn: "1 / -1" }} className="row-between">
            <span className="sub" style={{ fontSize: 13, marginTop: 0 }}>
              Takes about 2–4 minutes. Suppliers already on the chosen project are skipped.
            </span>
            <button type="submit" className="btn btn-primary" disabled={!canRun || running}>
              {running ? "Searching…" : "Find suppliers"}
            </button>
          </div>
        </form>
      </section>

      {(running || progress.queries.length > 0) && !view && (
        <section className="card" aria-live="polite" aria-labelledby="ph">
          <div className="row-between">
            <h2 id="ph" className="section">{running ? "Working on it" : "Search log"}</h2>
            {running && <span className="spinner" aria-hidden="true" />}
          </div>
          <div className="sub" style={{ fontSize: 13 }}>{progress.status}</div>
          <div className="stat-row">
            <span><strong className="num">{progress.queries.length}</strong> searches</span>
            <span><strong className="num">{progress.candidates?.inRange ?? "–"}</strong> in range</span>
            <span><strong className="num">{progress.checking.length}</strong> checked</span>
            <span><strong className="num">{progress.found}</strong> kept</span>
            <span><strong className="num">{progress.dropped.length}</strong> dropped</span>
          </div>
          {progress.queries.length > 0 && (
            <details className="log">
              <summary>Searches and dropped companies</summary>
              <ul>
                {progress.queries.map((q, i) => <li key={`q${i}`}>Searched: {q}</li>)}
                {progress.dropped.map((d, i) => <li key={`d${i}`}>Dropped {d.company}: {d.reason}</li>)}
              </ul>
            </details>
          )}
        </section>
      )}

      <ErrorLine error={error} />
      {notice && <div style={{ color: "var(--green-ink)", fontSize: 13 }} role="status">{notice}</div>}

      {(rows.length > 0 || view) && (
        <section className="card" aria-labelledby="rh">
          <div className="row-between">
            <div>
              <h2 id="rh" className="section">{header}</h2>
              <div className="sub">{view?.summary || summary || `${rows.length} found so far`}</div>
            </div>
            <div className="wrap-gap" style={{ alignItems: "center" }}>
              {rows.length > 0 && (
                <button type="button" className="btn btn-sm" onClick={() => downloadCsv(rows, view)}>Download CSV</button>
              )}
            </div>
          </div>

          {rows.length > 0 && projects.length > 0 && !running && (
            <div className="add-bar">
              <label htmlFor="add-proj" className="sub" style={{ marginTop: 0 }}>Add selected to</label>
              <select id="add-proj" className="select select-sm" value={addTo} onChange={(e) => setAddTo(e.target.value)}>
                <option value="">Choose a project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.client} – {p.product}</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-primary" disabled={!addTo || picked.size === 0 || adding} onClick={addToProject}>
                {adding ? "Adding…" : `Add ${picked.size || ""} to project`}
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="empty">No suppliers in this search.</div>
          ) : (
            <div className="table-wrap">
              <table className="data finder">
                <thead>
                  <tr>
                    <th aria-label="Select"></th>
                    <th>Company</th>
                    <th>Contact person</th>
                    <th>Email / contact form</th>
                    <th>Phone</th>
                    <th>Product</th>
                    <th>Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.company}-${i}`}>
                      <td className="cell-check">
                        <label className="check">
                          <input type="checkbox" checked={picked.has(i)} disabled={running && !view} onChange={() => toggle(i)} />
                          <span className="visually-hidden">Select {r.company}</span>
                        </label>
                      </td>
                      <td className="cell-company">
                        <div style={{ fontWeight: 600 }}>
                          {r.website ? <a href={r.website} target="_blank" rel="noreferrer">{r.company}</a> : r.company}
                        </div>
                        <div className="sub">
                          {[r.type, [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                          {r.distance_miles !== null ? ` · ${r.distance_miles} mi` : ""}
                        </div>
                      </td>
                      <td data-label="Contact"><div>
                        {r.contact_person ? (
                          <>
                            <div>{r.contact_person}</div>
                            <div className="sub">{r.contact_title}</div>
                          </>
                        ) : (
                          <span className="faint">Not listed</span>
                        )}
                      </div></td>
                      <td data-label="Email / form"><div>
                        {r.email && (
                          <div>
                            <a href={`mailto:${r.email}`}>{r.email}</a>
                            {r.email_type === "generic" && <span className="sub"> · general inbox</span>}
                          </div>
                        )}
                        {r.contact_form_url && (
                          <div className={r.email ? "sub" : undefined}>
                            <a href={r.contact_form_url} target="_blank" rel="noreferrer">Contact form ↗</a>
                          </div>
                        )}
                        {!r.email && !r.contact_form_url && <span className="faint">—</span>}
                      </div></td>
                      <td data-label="Phone" className="num" style={{ textAlign: "left", whiteSpace: "nowrap" }}><div>
                        {r.phone ? <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>{r.phone}</a> : <span className="faint">—</span>}
                      </div></td>
                      <td data-label="Product"><div>
                        <span className={`pill ${r.product_available === "yes" ? "pill-done" : r.product_available === "no" ? "pill-late" : "pill-warn"}`}>
                          {r.product_available === "yes" ? "Yes" : r.product_available === "no" ? "No" : "Check"}
                        </span>
                        {r.notes && <div className="sub" style={{ maxWidth: 220 }}>{r.notes}</div>}
                      </div></td>
                      <td className="sources" data-label="Sources"><div>
                        {Object.entries(r.sources).filter(([, u]) => u).map(([k, u]) => (
                          <a key={k} href={u as string} target="_blank" rel="noreferrer">{SOURCE_LABEL[k] ?? k}</a>
                        ))}
                        {Object.values(r.sources).every((u) => !u) && <span className="faint">—</span>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="hh">
        <h2 id="hh" className="section">Past searches</h2>
        {searches.length === 0 ? (
          <div className="empty">No searches yet.</div>
        ) : (
          <ul className="list">
            {searches.map((s) => (
              <li key={s.id} className="row-between" style={{ padding: "12px 0", flexWrap: "nowrap" }}>
                <button type="button" className="link-btn" onClick={() => { setView(s); setPicked(new Set()); setNotice(""); }}>
                  <strong>{s.product}</strong>
                  <span className="sub" style={{ marginTop: 0 }}>
                    {" "}· ZIP {s.zip} · {s.radius_miles} mi · {s.results.length} supplier{s.results.length === 1 ? "" : "s"} · {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {s.status === "running" ? " · running" : s.status === "error" ? " · failed" : ""}
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label={`Delete search for ${s.product}`} onClick={() => removeSearch(s.id)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  product: "Product page",
  email: "Email source",
  person: "Name source",
  phone: "Phone source",
  active: "Active",
};

function downloadCsv(rows: FinderResult[], view: SavedSearch | null) {
  const headers = [
    "Company name", "Contact person", "Title", "Email", "Email type", "Contact form", "Phone",
    "Website", "City", "State", "ZIP", "Distance (mi)", "Product available", "Product page", "Email source", "Notes",
  ];
  const lines = rows.map((r) => [
    r.company, r.contact_person, r.contact_title, r.email, r.email_type, r.contact_form_url, r.phone,
    r.website, r.city, r.state, r.zip, r.distance_miles ?? "", r.product_available,
    r.sources.product ?? "", r.sources.email ?? "", r.notes,
  ]);
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [headers, ...lines].map((l) => l.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const zip = view?.zip ?? "";
  a.download = `suppliers${zip ? `-${zip}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
