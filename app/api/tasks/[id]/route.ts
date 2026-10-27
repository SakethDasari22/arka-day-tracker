import { NextResponse } from "next/server";
import { deleteTask, setTaskDone, setTaskStatus } from "@/lib/queries";
import type { TaskStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const n = Number(id);
    if (!Number.isInteger(n)) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }
    const body = await req.json();
    if (typeof body.done === "boolean") {
      await setTaskDone(n, body.done);
    } else if (typeof body.status === "string") {
      await setTaskStatus(n, body.status as TaskStatus);
    } else {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update task" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteTask(Number(id));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete task" },
      { status: 500 }
    );
  }
}
