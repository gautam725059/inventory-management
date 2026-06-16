import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/db";
import { SESSION_COOKIE, getSessionToken, sessionCookieOptions } from "@/lib/auth";

/** Log out: destroy the session and clear the cookie. */
export async function POST(request: Request) {
  await deleteSession(getSessionToken(request));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}
