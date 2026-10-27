"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import type { Assignment, LogEntry, Task } from "@/lib/types";

const LOG_TAGS = [
  "Supplier research",
  "Building the sheet",
  "Follow-ups",
  "Slack / other",
];
const SUPPLIER_GOAL = 15;

interface GmailRow {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export default function TodayScreen({
  userName,
  dateLong,
  assignment,
  tasks: initialTasks,
  log: initialLog,
  suppliersTotal,
  suppliersWithEmail,
  googleConnected,
}: {
  userName: string;
  dateLong: string;
  assignment: Assignment | null;
  tasks: Task[];
  log: LogEntry[];
  suppliersTotal: number;
  suppliersWithEmail: number;
  googleConnected: boolean;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [log, setLog] = useState<LogEntry[]>(initialLog);
  const [newTask, setNewTask] = useState("");
  const [draft, setDraft] = useState("");
  const [logTag, setLogTag] = useState(LOG_TAGS[0]);
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState("");
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [allanMsg, setAllanMsg] = useState(assignment?.raw_message ?? "");
  const [emails, setEmails] = useState<GmailRow[] | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);

  async function pullGmail() {
    setGmailBusy(true);
    setError("");
    try {
      const res = await api<{ emails: GmailRow[] }>("/api/gmail");
      setEmails(res.emails);
    } catch (e) {
      setError(msg(e));
    } finally {
      setGmailBusy(false);
    }
  }

  async function emailToTask(id: string) {
    setGmailBusy(true);
    setError("");
    try {
      await api("/api/gmail/to-task", { method: "POST", body: { messageId: id } });
      setEmails(null);
      router.refresh();
    } catch (e) {
      setError(msg(e));
    } finally {
      setGmailBusy(false);
    }
  }

  const doneCount = tasks.filter((t) => t.done).length;

  async function toggleTask(task: Task) {
    const done = !task.done;
    setTasks((ts) =>
      ts.map((t) =>
        t.id === task.id
          ? { ...t, done, status: done ? "done" : "progress" }
          : t
      )
    );
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { done } });
    } catch (e) {
      setError(msg(e));
      setTasks(initialTasks);
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTask.trim();
    if (!title) return;
    setNewTask("");
    try {
      const task = await api<Task>("/api/tasks", {
        method: "POST",
        body: { title, tag: "Added" },
      });
      setTasks((ts) => [...ts, task]);
    } catch (e) {
      setError(msg(e));
    }
  }

  async function removeTask(id: number) {
    setTasks((ts) => ts.filter((t) => t.id !== id));
    try {
      await api(`/api/tasks/${id}`, { method: "DELETE" });
    } catch (e) {
      setError(msg(e));
    }
  }

  async function addLogEntry(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setMinutes("");
    try {
      const entry = await api<LogEntry>("/api/log", {
        method: "POST",
        body: { text, tag: logTag, minutes: minutes || null },
      });
      setLog((l) => [entry, ...l]);
    } catch (e) {
      setError(msg(e));
    }
  }

  async function removeLog(id: number) {
    setLog((l) => l.filter((e) => e.id !== id));
    try {
      await api(`/api/log/${id}`, { method: "DELETE" });
    } catch (e) {
      setError(msg(e));
    }
  }

  async function saveAssignment(e: React.FormEvent) {
    e.preventDefault();
    const raw = allanMsg.trim();
    if (!raw) return;
    try {
      await api("/api/assignment", {
        method: "POST",
        body: { raw_message: raw },
      });
      setEditingAssignment(false);
      router.refresh();
    } catch (e) {
      setError(msg(e));
    }
  }

  return (
    <main className="main">
      <header className="row-between">
        <div>
          <div className="date-line">{dateLong}</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 700 }}>
            Good {greeting()}, {userName}
          </h1>
        </div>
        <Link href="/report" className="btn btn-primary">
          Wrap up day →
        </Link>
      </header>

      {error && (
        <div style={{ color: "var(--red)", fontSize: 13 }} role="alert">
          {error}
        </div>
      )}

      <section className="stat-grid" aria-label="Today at a glance">
        <StatCard label="Tasks done" value={`${doneCount} / ${tasks.length}`} />
        <StatCard label="Suppliers found" value={String(suppliersTotal)} />
        <StatCard label="With a direct email" value={String(suppliersWithEmail)} />
        <StatCard label="Entries logged" value={String(log.length)} />
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: "3 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Tasks */}
          <section className="card">
            <div className="row-between">
              <div>
                <h2 className="section">Today&apos;s tasks</h2>
                <div className="sub">From Allan — check them off as you go</div>
              </div>
            </div>
            <ul className="list">
              {tasks.length === 0 && (
                <li style={{ padding: "14px 0", color: "var(--muted-2)", fontSize: 14, borderTop: "1px solid var(--line-2)" }}>
                  No tasks yet. Add Allan&apos;s tasks below or paste his message in the sidebar.
                </li>
              )}
              {tasks.map((t) => (
                <li
                  key={t.id}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0" }}
                >
                  <input
                    type="checkbox"
                    id={`task-${t.id}`}
                    checked={t.done}
                    onChange={() => toggleTask(t)}
                    style={{ width: 20, height: 20, accentColor: "var(--clay)", flex: "none" }}
                  />
                  <label
                    htmlFor={`task-${t.id}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 15,
                      color: t.done ? "var(--muted-2)" : "var(--ink)",
                      textDecoration: t.done ? "line-through" : "none",
                    }}
                  >
                    {t.title}
                  </label>
                  {t.tag && <span className="chip" style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--muted)" }}>{t.tag}</span>}
                  <span className={`pill ${t.done ? "pill-done" : t.status === "progress" ? "pill-progress" : "pill-todo"}`}>
                    {t.done ? "Done" : t.status === "progress" ? "In progress" : "To do"}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Delete task: ${t.title}`}
                    onClick={() => removeTask(t.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={addTask} className="wrap-gap" style={{ marginTop: 16 }}>
              <input
                className="input"
                style={{ flex: "1 1 260px" }}
                placeholder="Add a task…"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                aria-label="Add a task"
              />
              <button type="submit" className="btn btn-dark btn-sm">
                Add task
              </button>
            </form>
          </section>

          {/* Quick log */}
          <section className="card">
            <h2 className="section">Quick log</h2>
            <div className="sub">
              One line each time you finish something — it builds your report for you.
            </div>
            <form onSubmit={addLogEntry} className="wrap-gap" style={{ marginTop: 14 }}>
              <input
                className="input"
                style={{ flex: "1 1 300px" }}
                placeholder="e.g. Called 2 distributors in Joliet, got sales emails"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="What did you just do?"
              />
              <select
                className="select"
                style={{ flex: "0 1 190px" }}
                value={logTag}
                onChange={(e) => setLogTag(e.target.value)}
                aria-label="Category"
              >
                {LOG_TAGS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input
                className="input"
                style={{ flex: "0 1 110px" }}
                type="number"
                min="0"
                placeholder="min"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                aria-label="Minutes spent (optional)"
              />
              <button type="submit" className="btn btn-primary">
                Log it
              </button>
            </form>
          </section>

          {/* Activity */}
          <section className="card">
            <h2 className="section">Activity today</h2>
            <ol className="list" style={{ marginTop: 10 }}>
              {log.length === 0 && (
                <li style={{ padding: "12px 0", color: "var(--muted-2)", fontSize: 14, borderTop: "1px solid var(--line-2)" }}>
                  Nothing logged yet today.
                </li>
              )}
              {log.map((e) => (
                <li
                  key={e.id}
                  style={{ display: "flex", gap: 16, padding: "10px 0", alignItems: "baseline" }}
                >
                  <span style={{ flex: "none", width: 72, fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted-2)" }}>
                    {formatTime(e.created_at)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{e.text}</span>
                  {e.tag && (
                    <span style={{ flex: "none", fontSize: 12, color: "var(--clay)", fontWeight: 500 }}>
                      {e.tag}
                    </span>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Delete log entry"
                    onClick={() => removeLog(e.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Aside */}
        <aside style={{ flex: "2 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
          <section className="card">
            <div className="eyebrow">Current assignment</div>
            <h2 style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 600 }}>
              {assignment?.title ?? "No assignment set"}
            </h2>
            <div className="wrap-gap" style={{ marginTop: 12, gap: 8 }}>
              {assignment?.area && <span className="chip">{assignment.area}</span>}
              {assignment?.material && <span className="chip">{assignment.material}</span>}
              {assignment?.need && <span className="chip">{assignment.need}</span>}
            </div>
            <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--muted)" }}>Suppliers logged</span>
              <span style={{ fontFamily: "var(--mono)" }}>
                {suppliersTotal} / {SUPPLIER_GOAL} goal
              </span>
            </div>
            <div
              className="progress-track"
              role="img"
              aria-label={`${suppliersTotal} of ${SUPPLIER_GOAL} suppliers logged`}
              style={{ marginTop: 8 }}
            >
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, (suppliersTotal / SUPPLIER_GOAL) * 100)}%` }}
              />
            </div>
            <Link href="/research" className="btn" style={{ marginTop: 18, width: "100%", borderColor: "var(--clay)", color: "var(--clay)" }}>
              Open research log
            </Link>
          </section>

          <section className="card">
            <div className="row-between">
              <h2 className="section">Allan&apos;s message</h2>
              <div className="wrap-gap" style={{ gap: 8 }}>
                {googleConnected ? (
                  <button type="button" className="btn btn-sm" onClick={pullGmail} disabled={gmailBusy}>
                    {gmailBusy ? "…" : "Pull from Gmail"}
                  </button>
                ) : (
                  <Link href="/connect" className="btn btn-sm">Connect Gmail</Link>
                )}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setEditingAssignment((v) => !v)}
                >
                  {editingAssignment ? "Cancel" : assignment ? "Update" : "Add"}
                </button>
              </div>
            </div>

            {emails && (
              <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
                {emails.length === 0 && (
                  <div className="sub" style={{ padding: 12 }}>No recent emails found.</div>
                )}
                {emails.map((em) => (
                  <div key={em.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--line-2)", display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{em.subject}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{em.from}</div>
                    </div>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => emailToTask(em.id)} disabled={gmailBusy}>
                      Make task
                    </button>
                  </div>
                ))}
                <button type="button" className="icon-btn" style={{ margin: 8 }} onClick={() => setEmails(null)}>
                  Close
                </button>
              </div>
            )}

            {editingAssignment ? (
              <form onSubmit={saveAssignment} style={{ marginTop: 12 }}>
                <textarea
                  className="input"
                  value={allanMsg}
                  onChange={(e) => setAllanMsg(e.target.value)}
                  placeholder="Paste Allan's message here. I'll pull out the ZIP, radius and material automatically."
                  aria-label="Allan's message"
                />
                <button type="submit" className="btn btn-primary" style={{ marginTop: 10, width: "100%" }}>
                  Save assignment
                </button>
              </form>
            ) : assignment?.raw_message ? (
              <blockquote className="quote">{assignment.raw_message}</blockquote>
            ) : (
              <div className="sub" style={{ marginTop: 12 }}>
                No message yet. Tap <strong>Add</strong> and paste what Allan sent.
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat" style={{ padding: "16px 18px" }}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function formatTime(ts: string): string {
  // DB sends "2026-10-27 16:30:00.123+00"; make it ISO so Date parses it.
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
