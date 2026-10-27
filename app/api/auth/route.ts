import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, token } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    // No password configured — app is open (demo mode).
    return NextResponse.json({ ok: true });
  }
  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");
  if (password !== expected) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
  return NextResponse.json({ ok: true });
}
