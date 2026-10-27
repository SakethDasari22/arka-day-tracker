import { NextResponse } from "next/server";
import { exchangeCode, redirectUriFrom } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/connect?error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/connect?error=nocode", req.url));
  }
  try {
    await exchangeCode(code, redirectUriFrom(req.url));
    return NextResponse.redirect(new URL("/connect?connected=1", req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exchange_failed";
    return NextResponse.redirect(new URL(`/connect?error=${encodeURIComponent(msg)}`, req.url));
  }
}
