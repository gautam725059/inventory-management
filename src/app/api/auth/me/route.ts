import { NextResponse } from "next/server";
import { getCurrentPublicUser } from "@/lib/auth";

/** The currently logged-in user (or { user: null }). */
export async function GET(request: Request) {
  const user = await getCurrentPublicUser(request);
  return NextResponse.json({ user });
}
