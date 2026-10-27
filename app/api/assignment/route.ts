import { NextResponse } from "next/server";
import { parseAssignment, setAssignment } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // If a raw message is given, parse it; otherwise take explicit fields.
    if (body.raw_message) {
      const parsed = parseAssignment(String(body.raw_message));
      const saved = await setAssignment(parsed);
      return NextResponse.json(saved, { status: 201 });
    }
    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    const saved = await setAssignment({
      title,
      area: body.area || undefined,
      material: body.material || undefined,
      need: body.need || undefined,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save" },
      { status: 500 }
    );
  }
}
