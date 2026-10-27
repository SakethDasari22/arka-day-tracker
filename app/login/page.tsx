"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Wrong password");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        minHeight: "100vh",
        width: "100%",
      }}
    >
      <form onSubmit={submit} className="card" style={{ width: 360, maxWidth: "100%" }}>
        <div className="eyebrow">Arka Day Tracker</div>
        <h1 style={{ margin: "6px 0 2px", fontSize: 22 }}>Sign in</h1>
        <p className="sub" style={{ marginBottom: 18 }}>
          This tracker holds real supplier data, so it&apos;s password-locked.
        </p>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input
            id="pw"
            className="input"
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 16 }}
          disabled={busy}
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
