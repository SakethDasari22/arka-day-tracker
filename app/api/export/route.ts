import { getSuppliers } from "@/lib/queries";
import { isoDate } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV export of today's suppliers. Opens directly in Excel and Google Sheets. */
export async function GET() {
  const suppliers = await getSuppliers();
  const headers = [
    "Company",
    "Type",
    "Sales contact",
    "Email",
    "Phone",
    "Website",
    "Location",
    "Status",
  ];
  const rows = suppliers.map((s) => [
    s.company,
    s.type,
    s.contact ?? "",
    s.email ?? "",
    s.phone ?? "",
    s.website ?? "",
    s.location ?? "",
    s.complete ? "Complete" : "Needs contact",
  ]);

  const csv = [headers, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");

  // Prepend a BOM so Excel reads UTF-8 correctly.
  const body = "﻿" + csv;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suppliers-${isoDate()}.csv"`,
    },
  });
}

function csvCell(value: string): string {
  const needsQuote = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}
