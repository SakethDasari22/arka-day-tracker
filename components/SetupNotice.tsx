export default function SetupNotice() {
  return (
    <main className="main">
      <div className="page-head">
        <div className="eyebrow">Almost there</div>
        <h1>Connect a database</h1>
      </div>
      <div className="setup-note">
        <p style={{ marginTop: 0 }}>
          The tracker needs a Postgres database so your tasks and suppliers are
          saved and follow you between devices. Nothing is stored yet.
        </p>
        <p>
          <strong>On Vercel:</strong> open the project → <em>Storage</em> → create
          a Postgres store and attach it. Vercel sets <code>POSTGRES_URL</code>{" "}
          for you. Redeploy and this screen goes away.
        </p>
        <p style={{ marginBottom: 0 }}>
          <strong>Locally (Mac Mini):</strong> put a connection string in{" "}
          <code>.env</code> as <code>DATABASE_URL</code>, then restart the app.
        </p>
      </div>
    </main>
  );
}
