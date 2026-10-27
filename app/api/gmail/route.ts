import { NextResponse } from "next/server";
import { listRecentEmails } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") || undefined;
    const emails = await listRecentEmails({ from });
    return NextResponse.json({ emails });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to read Gmail" },
      { status: 500 }
    );
  }
}
