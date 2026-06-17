import { NextResponse } from "next/server";
import {
  ensureAdminSeeded,
  findUserByUsername,
  findActiveUsersByRole,
  createSession,
  toPublicUser,
} from "@/lib/db";
import { verifyPasswordHash } from "@/lib/password";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import type { Role, User } from "@/lib/types";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

/** Log in by role + password (the dropdown login), or username + password.
 *  Sets an httpOnly session cookie. */
export async function POST(request: Request) {
  await ensureAdminSeeded();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const role = typeof b.role === "string" ? b.role : "";
  const username = typeof b.username === "string" ? b.username.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";

  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  let user: User | null = null;

  if (role === "admin" || role === "staff") {
    // Role-based login: match the password against any active user of that role.
    const candidates = await findActiveUsersByRole(role as Role);
    user = candidates.find((u) => verifyPasswordHash(password, u.passwordHash)) ?? null;
  } else if (username) {
    const u = await findUserByUsername(username);
    user = u && u.active && verifyPasswordHash(password, u.passwordHash) ? u : null;
  } else {
    return NextResponse.json(
      { error: "Select a role and enter the password." },
      { status: 400 }
    );
  }

  if (!user) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = await createSession(user.id);
  const res = NextResponse.json({ user: toPublicUser(user) });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}
