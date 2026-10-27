import { driveClient, gmailClient, sheetsClient } from "./google";

/* ---------------------------------- Gmail -------------------------------- */

export interface EmailSummaryRow {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export async function listRecentEmails(opts: {
  from?: string;
  max?: number;
}): Promise<EmailSummaryRow[]> {
  const gmail = await gmailClient();
  const qParts = ["in:inbox", "newer_than:14d"];
  if (opts.from) qParts.push(`from:${opts.from}`);
  const list = await gmail.users.messages.list({
    userId: "me",
    q: qParts.join(" "),
    maxResults: opts.max ?? 12,
  });
  const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);

  const rows = await Promise.all(
    ids.map(async (id) => {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const headers = msg.data.payload?.headers ?? [];
      const h = (name: string) =>
        headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
      return {
        id,
        from: h("From"),
        subject: h("Subject") || "(no subject)",
        date: h("Date"),
        snippet: decodeEntities(msg.data.snippet ?? ""),
      };
    })
  );
  return rows;
}

export async function getEmailText(id: string): Promise<{
  subject: string;
  from: string;
  text: string;
}> {
  const gmail = await gmailClient();
  const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const headers = msg.data.payload?.headers ?? [];
  const h = (name: string) =>
    headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
  const text = extractPlainText(msg.data.payload) || decodeEntities(msg.data.snippet ?? "");
  return { subject: h("Subject"), from: h("From"), text };
}

type GmailPart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPart[] | null;
};

function extractPlainText(part: GmailPart | null | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return b64urlDecode(part.body.data);
  }
  if (part.parts) {
    for (const p of part.parts) {
      const t = extractPlainText(p);
      if (t) return t;
    }
  }
  // Last resort: strip tags from an HTML part.
  if (part.mimeType === "text/html" && part.body?.data) {
    return b64urlDecode(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function b64urlDecode(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/* ---------------------------------- Drive -------------------------------- */

export interface DriveSheetRow {
  id: string;
  name: string;
  url: string;
  modifiedTime: string;
}

export async function listSpreadsheets(search?: string): Promise<DriveSheetRow[]> {
  const drive = await driveClient();
  const q = [
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    "trashed = false",
    search ? `name contains '${search.replace(/'/g, "")}'` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  const res = await drive.files.list({
    q,
    orderBy: "modifiedTime desc",
    pageSize: 20,
    fields: "files(id, name, modifiedTime, webViewLink)",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name ?? "(untitled)",
    url: f.webViewLink ?? `https://docs.google.com/spreadsheets/d/${f.id}`,
    modifiedTime: f.modifiedTime ?? "",
  }));
}

/* ---------------------------------- Sheets ------------------------------- */

export function sheetIdFromUrl(input: string): string | null {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  // Maybe they pasted the bare id.
  if (/^[a-zA-Z0-9-_]{20,}$/.test(input.trim())) return input.trim();
  return null;
}

export interface SheetData {
  headers: string[];
  rows: string[][];
}

export async function readSheet(
  spreadsheetId: string,
  range = "A1:Z1000"
): Promise<SheetData> {
  const sheets = await sheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = (res.data.values ?? []) as string[][];
  if (values.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = values;
  return { headers: headers.map((h) => String(h ?? "")), rows };
}
