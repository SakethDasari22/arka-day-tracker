import { NextResponse } from "next/server";
import { listSpreadsheets } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || undefined;
    const sheets = await listSpreadsheets(q);
    return NextResponse.json({ sheets });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list Drive sheets" },
      { status: 500 }
    );
  }
}
