"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

interface DriveSheet {
  id: string;
  name: string;
  url: string;
  modifiedTime: string;
}

export default function ConnectScreen({
  status,
  linkedSheet,
}: {
  status: { configured: boolean; connected: boolean; email: string | null };
  linkedSheet: { id: string; name: string | null; url: string | null } | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheets, setSheets] = useState<DriveSheet[] | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");

  async function disconnect() {
    setBusy(true);
    try {
      await api("/api/google/disconnect", { method: "POST" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function findSheets() {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ sheets: DriveSheet[] }>("/api/drive/sheets");
      setSheets(res.sheets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to search Drive");
    } finally {
      setBusy(false);
    }
  }

  async function linkSheet(payload: object) {
    setBusy(true);
    setError("");
    try {
      await api("/api/assignment/sheet", { method: "POST", body: payload });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <div className="page-head">
        <div className="eyebrow">Settings</div>
        <h1>Connections</h1>
      </div>

      {error && (
        <div style={{ color: "var(--red)", fontSize: 13 }} role="alert">
          {error}
        </div>
      )}

      {/* Google account */}
      <section className="card">
        <div className="row-between">
          <div>
            <h2 className="section">Google account</h2>
            <div className="sub">Gmail, Google Sheets and Drive share one sign-in.</div>
          </div>
          <StatusBadge status={status} />
        </div>

        {!status.configured ? (
          <div className="setup-note" style={{ marginTop: 16 }}>
            <p style={{ marginTop: 0 }}>
              Google isn&apos;t set up on the server yet. Add{" "}
              <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to
              your environment variables (see the setup steps), then redeploy.
            </p>
            <p style={{ marginBottom: 0 }}>
              You create those once in the Google Cloud Console — it takes about
              five minutes.
            </p>
          </div>
        ) : status.connected ? (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14 }}>
              Connected as <strong>{status.email ?? "your Google account"}</strong>
            </span>
            <button type="button" className="btn btn-sm" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <a className="btn btn-primary" href="/api/google/connect">
              Connect Google
            </a>
            <div className="sub" style={{ marginTop: 10 }}>
              You&apos;ll be asked to allow read access to Gmail and Drive, and
              access to your Sheets. Read-only for Gmail — nothing is sent or
              deleted.
            </div>
          </div>
        )}
      </section>

      {/* Sheet link */}
      {status.connected && (
        <section className="card">
          <h2 className="section">Allan&apos;s supplier sheet</h2>
          <div className="sub">
            Link the Google Sheet Allan shared. You can import its rows into your
            supplier log, so anything you add there shows up here as tracked work.
          </div>

          {linkedSheet?.id ? (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14 }}>
                Linked:{" "}
                <a href={linkedSheet.url ?? "#"} target="_blank" rel="noreferrer">
                  {linkedSheet.name || "Google Sheet"}
                </a>
              </span>
              <button type="button" className="btn btn-sm" onClick={() => linkSheet({ clear: true })} disabled={busy}>
                Unlink
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <button type="button" className="btn" onClick={findSheets} disabled={busy}>
                  {busy ? "Loading…" : "Find a sheet in my Drive"}
                </button>
              </div>
              {sheets && (
                <ul className="list" style={{ marginTop: 0 }}>
                  {sheets.length === 0 && (
                    <li style={{ padding: "12px 0", color: "var(--muted-2)", fontSize: 14, borderTop: "1px solid var(--line-2)" }}>
                      No spreadsheets found in your Drive.
                    </li>
                  )}
                  {sheets.map((s) => (
                    <li key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{s.name}</span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => linkSheet({ id: s.id, name: s.name, url: s.url })}
                        disabled={busy}
                      >
                        Link
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="wrap-gap">
                <input
                  className="input"
                  style={{ flex: "1 1 320px" }}
                  placeholder="…or paste a Google Sheet link"
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  aria-label="Paste a Google Sheet link"
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => linkSheet({ sheetUrl: pasteUrl })}
                  disabled={busy || !pasteUrl.trim()}
                >
                  Link
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="section">Slack</h2>
        <div className="sub" style={{ marginBottom: 0 }}>
          Coming next — it needs an app approved by Arka&apos;s workspace admin.
          Once that&apos;s done, tasks Allan sends you on Slack can flow in here
          automatically, and the end-of-day report can post back to him.
        </div>
      </section>
    </main>
  );
}

function StatusBadge({
  status,
}: {
  status: { configured: boolean; connected: boolean };
}) {
  const [label, cls] = !status.configured
    ? ["Not set up", "pill-todo"]
    : status.connected
    ? ["Connected", "pill-done"]
    : ["Not connected", "pill-warn"];
  return <span className={`pill ${cls}`} style={{ padding: "6px 12px" }}>{label}</span>;
}
