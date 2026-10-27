import { NextResponse } from "next/server";
import { addSupplier } from "@/lib/queries";
import type { SupplierType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const company = String(body.company ?? "").trim();
    if (!company) {
      return NextResponse.json(
        { error: "Company is required" },
        { status: 400 }
      );
    }
    const type: SupplierType =
      body.type === "Distributor" ? "Distributor" : "Manufacturer";
    const supplier = await addSupplier({
      company,
      type,
      contact: str(body.contact),
      email: str(body.email),
      phone: str(body.phone),
      website: str(body.website),
      location: str(body.location),
    });
    return NextResponse.json(supplier, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add supplier" },
      { status: 500 }
    );
  }
}

function str(v: unknown): string | undefined {
  const s = v == null ? "" : String(v).trim();
  return s || undefined;
}
