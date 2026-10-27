"use client";

import { useMemo, useState } from "react";
import type { Assignment } from "@/lib/types";
import type { DayReport } from "@/lib/queries";

const TAG_COLORS: Record<string, string> = {
  "Supplier research": "#8A4B12",
  "Building the sheet": "#D08A45",
  "Follow-ups": "#1D4ED8",
  "Slack / other": "#A9AEB8",
};
const FALLBACK_COLORS = ["#8A4B12", "#D08A45", "#1D4ED8", "#146C34", "#A9AEB8"];

export default function ReportScreen({
  dateLong,
  report,
  assignment,
  doneTaskTitles,
  openSupplierNames,
}: {
  dateLong: string;
  report: DayReport;
  assignment: Assignment | null;
  doneTaskTitles: string[];
  openSupplierNames: string[];
}) {
  const generated = useMemo(
    () => buildMessage({ report, assignment, openSupplierNames }),
    [report, assignment, openSupplierNames]
  );
  const [message, setMessage] = useState(generated);
  const [plan, setPlan] = useState(defaultPlan(openSupplierNames));
  const [copied, setCopied] = useState(false);

  const segments = report.minutesByTag.map((m, i) => ({
    ...m,
    color: TAG_COLORS[m.tag] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="main">
      <header className="row-between" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="date-line">{dateLong}</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 700 }}>
            End-of-day report
          </h1>
          <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>
            Built from today&apos;s tasks, suppliers and quick logs. Edit anything before sending.
          </div>
        </div>
        <span className="pill pill-todo" style={{ padding: "8px 14px" }}>
          Draft · not sent yet
        </span>
      </header>

      <section className="stat-grid" aria-label="Day summary">
        <Stat label="Tasks completed" value={`${report.tasksDone} / ${report.tasksTotal}`} />
        <Stat
          label="Suppliers delivered"
          value={String(report.suppliersTotal)}
          note={`${report.manufacturers} manufacturers · ${report.distributors} distributors`}
        />
        <Stat
          label="Full contact info"
          value={`${report.suppliersComplete} / ${report.suppliersTotal}`}
          note="email + phone"
        />
        <Stat label="Time logged" value={fmtDuration(report.totalMinutes)} />
      </section>

      {segments.length > 0 && (
        <section className="card">
          <h2 className="section">Where the time went</h2>
          <div
            role="img"
            aria-label={segments.map((s) => `${s.tag} ${fmtDuration(s.minutes)}`).join(", ")}
            style={{ display: "flex", height: 18, borderRadius: 6, overflow: "hidden", marginTop: 16, gap: 2 }}
          >
            {segments.map((s) => (
              <div key={s.tag} style={{ flex: s.minutes, background: s.color }} />
            ))}
          </div>
          <div className="wrap-gap" style={{ marginTop: 12, gap: 18, fontSize: 13, color: "var(--ink-2)" }}>
            {segments.map((s) => (
              <span key={s.tag} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block" }} />
                {s.tag} · {fmtDuration(s.minutes)}
              </span>
            ))}
          </div>
        </section>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <section className="card" style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--green-ink)" }}>Done today</h2>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
              {report.suppliersTotal > 0 && (
                <li>
                  Found {report.suppliersTotal} supplier{report.suppliersTotal === 1 ? "" : "s"}
                  {assignment?.area ? ` for ${assignment.area}` : ""}
                </li>
              )}
              {doneTaskTitles.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
              {report.suppliersTotal === 0 && doneTaskTitles.length === 0 && (
                <li style={{ color: "var(--muted-2)" }}>Nothing marked done yet.</li>
              )}
            </ul>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--amber-ink)" }}>Open / blockers</h2>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
              {openSupplierNames.length > 0 ? (
                <li>
                  {openSupplierNames.length} supplier{openSupplierNames.length === 1 ? "" : "s"} still need an email or phone
                </li>
              ) : (
                <li style={{ color: "var(--muted-2)" }}>No blockers.</li>
              )}
            </ul>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--blue-ink)" }}>Plan for tomorrow</h2>
            <textarea
              className="input"
              style={{ marginTop: 10 }}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              aria-label="Plan for tomorrow"
            />
          </div>
        </section>

        <section className="card" style={{ flex: "1 1 360px", minWidth: 0 }}>
          <h2 className="section">Message to Allan</h2>
          <div className="sub">Slack · direct message</div>
          <textarea
            className="input"
            style={{ marginTop: 14, minHeight: 190, fontSize: 14, lineHeight: 1.6 }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="Message to Allan"
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 12,
              padding: "10px 12px",
              border: "1px dashed #d3d6dd",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              suppliers-{new Date().toISOString().slice(0, 10)}.csv
            </span>
            <a href="/api/export" className="btn btn-sm">Download</a>
          </div>
          <div className="wrap-gap" style={{ marginTop: 16 }}>
            <button type="button" className="btn" style={{ flex: "1 1 140px" }} onClick={() => setMessage(generated)}>
              Rebuild from data
            </button>
            <button type="button" className="btn btn-primary" style={{ flex: "1 1 160px" }} onClick={copy}>
              {copied ? "Copied ✓" : "Copy message"}
            </button>
          </div>
          <div className="sub" style={{ marginTop: 10 }}>
            Posting straight to Slack comes in the next version — for now, copy and paste.
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card stat" style={{ padding: "16px 18px" }}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

function fmtDuration(min: number): string {
  if (!min) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
}

function defaultPlan(openSupplierNames: string[]): string {
  const lines: string[] = [];
  if (openSupplierNames.length) {
    lines.push(`Call the ${openSupplierNames.length} supplier(s) missing a contact`);
  }
  lines.push("Wait on Allan's next ZIP or state");
  return lines.join("\n");
}

function buildMessage({
  report,
  assignment,
  openSupplierNames,
}: {
  report: DayReport;
  assignment: Assignment | null;
  openSupplierNames: string[];
}): string {
  const area = assignment?.area ? ` (${assignment.area})` : "";
  const lines = [
    `Hi Allan, here's my EOD:`,
    `• Supplier research${area}: ${report.suppliersTotal} suppliers — ${report.manufacturers} manufacturers, ${report.distributors} distributors. ${report.suppliersComplete} have full contact info. Sheet attached.`,
    `• Tasks: ${report.tasksDone} of ${report.tasksTotal} done.`,
  ];
  if (openSupplierNames.length) {
    lines.push(
      `• Open: ${openSupplierNames.length} supplier(s) need a call for sales contacts; doing that tomorrow AM.`
    );
  }
  lines.push(`Ready for the next area whenever you are.`);
  return lines.join("\n");
}
