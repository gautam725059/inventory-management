import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// App-wide auth wall (Next.js "proxy" convention, formerly "middleware").
// Runs on every request except static assets (see the matcher). Without a
// session cookie: page requests redirect to /login, API requests get a 401.
// Cookie *validity* is checked downstream in the route handlers (the
// file-based session store isn't reachable from Edge).
// ---------------------------------------------------------------------------

const SESSION_COOKIE = "sid";

// Paths reachable without logging in.
const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
]);

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, the favicon, and uploaded images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
