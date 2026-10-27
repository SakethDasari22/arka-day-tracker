import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, token } from "@/lib/auth";

/**
 * When APP_PASSWORD is set, everything except /login and the auth endpoint
 * requires a valid cookie. When it's unset, the app is open (demo mode).
 */
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (
    pathname === "/login" ||
    pathname === "/api/auth" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie === token(password)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
