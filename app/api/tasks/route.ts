import { NextResponse } from "next/server";
import { addTask } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    const tag = body.tag ? String(body.tag) : null;
    const task = await addTask(title, tag);
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add task" },
      { status: 500 }
    );
  }
}
