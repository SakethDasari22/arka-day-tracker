import { NextResponse } from "next/server";
import { deleteRow, InputError, updateRow } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ entity: string; id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { entity, id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    await updateRow(entity, Number(id), body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { entity, id } = await params;
    await deleteRow(entity, Number(id));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown) {
  const status = err instanceof InputError ? 400 : 500;
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Something went wrong" },
    { status }
  );
}
