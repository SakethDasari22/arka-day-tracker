import { google } from "googleapis";
import { query } from "./db";

/** The OAuth2 client type as produced by googleapis (avoids clashing with a
 * second google-auth-library copy nested under googleapis-common). */
type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>;

/**
 * Google OAuth for the deployed app. The site authenticates as *itself* (its own
 * OAuth client), the user signs in once, and we store the resulting tokens in
 * Postgres. Single-user tool, so there is one token row.
 */

const ACCOUNT = "primary";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
];

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Where Google sends the user back. Must be registered in the Google console. */
export function redirectUriFrom(reqUrl: string): string {
  const base = process.env.APP_BASE_URL || new URL(reqUrl).origin;
  return `${base.replace(/\/$/, "")}/api/google/callback`;
}

function oauthClient(redirectUri: string): GoogleOAuthClient {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

export function authUrl(redirectUri: string): string {
  return oauthClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    scope: GOOGLE_SCOPES,
    include_granted_scopes: true,
  });
}

interface StoredTokens {
  email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  token_type: string | null;
  expiry_date: string | null;
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const { rows } = await query<StoredTokens>(
    `SELECT email, access_token, refresh_token, scope, token_type, expiry_date::text AS expiry_date
       FROM google_tokens WHERE account = $1`,
    [ACCOUNT]
  );
  return rows[0] ?? null;
}

export async function saveTokens(
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    scope?: string | null;
    token_type?: string | null;
    expiry_date?: number | null;
  },
  email?: string | null
): Promise<void> {
  // Keep the existing refresh_token if Google didn't send a new one.
  await query(
    `INSERT INTO google_tokens (account, email, access_token, refresh_token, scope, token_type, expiry_date, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (account) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, google_tokens.email),
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, google_tokens.refresh_token),
       scope = EXCLUDED.scope,
       token_type = EXCLUDED.token_type,
       expiry_date = EXCLUDED.expiry_date,
       updated_at = now()`,
    [
      ACCOUNT,
      email ?? null,
      tokens.access_token ?? null,
      tokens.refresh_token ?? null,
      tokens.scope ?? null,
      tokens.token_type ?? null,
      tokens.expiry_date ?? null,
    ]
  );
}

export async function clearTokens(): Promise<void> {
  await query(`DELETE FROM google_tokens WHERE account = $1`, [ACCOUNT]);
}

/** Exchange an OAuth code for tokens and persist them. Returns the user email. */
export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<string | null> {
  const client = oauthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    email = me.data.email ?? null;
  } catch {
    /* email is best-effort */
  }

  await saveTokens(
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date,
    },
    email
  );
  return email;
}

/**
 * An OAuth2 client loaded with stored credentials and set to persist any
 * refreshed access token. Throws if Google isn't connected.
 */
export async function authedClient(): Promise<GoogleOAuthClient> {
  if (!isGoogleConfigured()) {
    throw new Error("Google isn't configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  const stored = await loadTokens();
  if (!stored || !stored.refresh_token) {
    throw new Error("Google isn't connected yet. Open the Connect page and sign in.");
  }
  const client = oauthClient(process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL.replace(/\/$/, "")}/api/google/callback` : "postmessage");
  client.setCredentials({
    access_token: stored.access_token ?? undefined,
    refresh_token: stored.refresh_token ?? undefined,
    scope: stored.scope ?? undefined,
    token_type: stored.token_type ?? undefined,
    expiry_date: stored.expiry_date ? Number(stored.expiry_date) : undefined,
  });
  client.on("tokens", (t) => {
    // Persist refreshed access tokens (and a rotated refresh token if present).
    void saveTokens({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      scope: t.scope,
      token_type: t.token_type,
      expiry_date: t.expiry_date,
    });
  });
  return client;
}

export async function getGoogleStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  email: string | null;
}> {
  const configured = isGoogleConfigured();
  if (!configured) return { configured, connected: false, email: null };
  try {
    const stored = await loadTokens();
    return {
      configured,
      connected: Boolean(stored?.refresh_token),
      email: stored?.email ?? null,
    };
  } catch {
    return { configured, connected: false, email: null };
  }
}

/* ------------------------------- API clients ----------------------------- */

export async function gmailClient() {
  return google.gmail({ version: "v1", auth: await authedClient() });
}
export async function sheetsClient() {
  return google.sheets({ version: "v4", auth: await authedClient() });
}
export async function driveClient() {
  return google.drive({ version: "v3", auth: await authedClient() });
}
