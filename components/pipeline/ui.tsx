"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { STAGES } from "@/lib/pipeline-types";

/* ------------------------------ Formatting ------------------------------ */

export function money(v: string | number | null | undefined, digits?: number): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  // Unit prices are often fractions of a cent apart, so show more decimals
  // under a dollar.
  const d = digits ?? (Math.abs(n) < 1 ? 3 : 2);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d })}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysLabel(days: number | null): { text: string; tone: "ok" | "warn" | "late" | "none" } {
  if (days === null) return { text: "No deadline", tone: "none" };
  if (days < 0) return { text: `${-days}d past deadline`, tone: "late" };
  if (days === 0) return { text: "Due today", tone: "warn" };
  return { text: `${days}d to deadline`, tone: days <= 7 ? "warn" : "ok" };
}

/* ------------------------------ Mutations ------------------------------- */

/**
 * Wraps every write: call the API, then re-render the server page so all
 * derived numbers (stage, scores, counts) come straight from the database.
 */
export function useMutate() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function run(url: string, method: string, body?: unknown): Promise<unknown> {
    setError("");
    try {
      const res = await api(url, { method, body });
      startTransition(() => router.refresh());
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return null;
    }
  }

  return {
    pending,
    error,
    setError,
    create: (entity: string, body: unknown) => run(`/api/pipeline/${entity}`, "POST", body),
    update: (entity: string, id: number, body: unknown) =>
      run(`/api/pipeline/${entity}/${id}`, "PATCH", body),
    remove: (entity: string, id: number) => run(`/api/pipeline/${entity}/${id}`, "DELETE"),
  };
}

/* ------------------------------ Components ------------------------------ */

export function Field({
  label,
  id,
  children,
  wide,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

/** Horizontal 8-step tracker. `compact` is the small version used in lists. */
export function Stepper({
  dates,
  stageIndex,
  compact,
}: {
  dates: Record<string, string | null>;
  stageIndex: number;
  compact?: boolean;
}) {
  return (
    <ol className={`stepper${compact ? " stepper-compact" : ""}`} aria-label="Project stages">
      {STAGES.map((s, i) => {
        const reached = Boolean(dates[s.key]);
        const current = i === stageIndex;
        return (
          <li
            key={s.key}
            className={`step${reached ? " reached" : ""}${current ? " current" : ""}`}
            aria-current={current ? "step" : undefined}
            title={`${s.label}${reached ? ` — ${fmtDate(dates[s.key])}` : " — not yet"}`}
          >
            <span className="step-dot" aria-hidden="true">
              {reached ? "✓" : i + 1}
            </span>
            {!compact && (
              <span className="step-text">
                <span className="step-label">{s.short}</span>
                <span className="step-date">{reached ? fmtDate(dates[s.key]) : "—"}</span>
              </span>
            )}
            {compact && <span className="visually-hidden">{s.label}{reached ? " done" : ""}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function ErrorLine({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div style={{ color: "var(--red)", fontSize: 13 }} role="alert">
      {error}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
