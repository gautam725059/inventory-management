import {
  ensureAdminSeeded,
  getSessionUser,
  toPublicUser,
} from "./db";
import type { Role, User, PublicUser } from "./types";

// ---------------------------------------------------------------------------
// Server-side auth helpers. A session token lives in an httpOnly cookie; we
// resolve it to the current user and check roles on each protected request.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "sid";

/** Pull the session token out of the request's Cookie header. */
export function getSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** The currently logged-in user for this request, or null. Also seeds the
 *  default admin on a fresh store so the system is never locked out. */
export async function getCurrentUser(request: Request): Promise<User | null> {
  await ensureAdminSeeded();
  return getSessionUser(getSessionToken(request));
}

/** Like getCurrentUser but returns the safe public shape. */
export async function getCurrentPublicUser(
  request: Request
): Promise<PublicUser | null> {
  const user = await getCurrentUser(request);
  return user ? toPublicUser(user) : null;
}

export function hasRole(user: User | null, ...roles: Role[]): boolean {
  return !!user && roles.includes(user.role);
}

/** Cookie attributes for the session cookie. */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}
