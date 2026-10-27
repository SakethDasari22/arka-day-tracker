import { NextResponse } from "next/server";
import { getAssignment, importSuppliersFromSheet } from "@/lib/queries";
import { readSheet } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const assignment = await getAssignment();
    if (!assignment?.sheet_id) {
      return NextResponse.json(
        { error: "No sheet linked yet. Link Allan's sheet first." },
        { status: 400 }
      );
    }
    const data = await readSheet(assignment.sheet_id);
    if (data.headers.length === 0) {
      return NextResponse.json({ error: "That sheet looks empty." }, { status: 400 });
    }
    const result = await importSuppliersFromSheet(data, assignment.sheet_id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to import from sheet" },
      { status: 500 }
    );
  }
}
