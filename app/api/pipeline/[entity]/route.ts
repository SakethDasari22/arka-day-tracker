import { NextResponse } from "next/server";
import { createRow, InputError } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a projects / outreach / quotes / samples / orders row. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ entity: string }> }
) {
  try {
    const { entity } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const created = await createRow(entity, body);
    return NextResponse.json(created, { status: 201 });
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
