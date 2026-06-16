import { NextResponse } from "next/server";
import {
  ensureAdminSeeded,
  findUserByUsername,
  createSession,
  toPublicUser,
} from "@/lib/db";
import { verifyPasswordHash } from "@/lib/password";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

/** Log in with username + password. Sets an httpOnly session cookie. */
export async function POST(request: Request) {
  await ensureAdminSeeded();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const username = typeof b.username === "string" ? b.username.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 }
    );
  }

  const user = await findUserByUsername(username);
  if (!user || !user.active || !verifyPasswordHash(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Invalid username or password." },
      { status: 401 }
    );
  }

  const token = await createSession(user.id);
  const res = NextResponse.json({ user: toPublicUser(user) });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}
