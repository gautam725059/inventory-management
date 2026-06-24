import { NextResponse } from "next/server";
import { listVendors, createVendor, deleteVendors } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { currentChannel } from "@/lib/channel";

/** Any logged-in user: list vendors (used by forms). */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json(await listVendors(await currentChannel()));
}

/** Admin only: create a vendor. */
export async function POST(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const result = await createVendor(
    body as Record<string, string>,
    await currentChannel()
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.party, { status: 201 });
}

/** Admin only: bulk-delete vendors. Body: { ids: string[] }. */
export async function DELETE(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const ids = Array.isArray(b.ids)
    ? b.ids.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No vendors selected." }, { status: 400 });
  }
  const deleted = await deleteVendors(ids);
  return NextResponse.json({ deleted });
}
