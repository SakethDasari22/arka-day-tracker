import { NextResponse } from "next/server";
import { authUrl, isGoogleConfigured, redirectUriFrom } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/connect?error=notconfigured", req.url));
  }
  const url = authUrl(redirectUriFrom(req.url));
  return NextResponse.redirect(url);
}
