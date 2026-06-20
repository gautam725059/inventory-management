import { NextResponse } from "next/server";
import { listCustomers, createCustomer, deleteCustomers } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

/** Any logged-in user: list customers (used by forms). */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json(await listCustomers());
}

/** Admin only: create a customer. */
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
  const result = await createCustomer(body as Record<string, string>);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.party, { status: 201 });
}

/** Admin only: bulk-delete customers. Body: { ids: string[] }. */
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
    return NextResponse.json({ error: "No customers selected." }, { status: 400 });
  }
  const deleted = await deleteCustomers(ids);
  return NextResponse.json({ deleted });
}
