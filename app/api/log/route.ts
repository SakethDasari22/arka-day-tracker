import { NextResponse } from "next/server";
import { addLog } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = String(body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    const tag = body.tag ? String(body.tag) : null;
    const minutes =
      body.minutes != null && body.minutes !== ""
        ? Number(body.minutes)
        : null;
    const entry = await addLog(
      text,
      tag,
      Number.isFinite(minutes as number) ? (minutes as number) : null
    );
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to log" },
      { status: 500 }
    );
  }
}
