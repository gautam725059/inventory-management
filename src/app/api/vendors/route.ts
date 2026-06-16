import { NextResponse } from "next/server";
import { listVendors, createVendor } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

/** Any logged-in user: list vendors (used by forms). */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json(await listVendors());
}

/** Manager/admin: create a vendor. */
export async function POST(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin", "manager")) {
    return NextResponse.json({ error: "Admin or manager only." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const result = await createVendor(body as Record<string, string>);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.party, { status: 201 });
}
