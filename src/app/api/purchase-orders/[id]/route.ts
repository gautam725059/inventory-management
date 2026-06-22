import { NextResponse } from "next/server";
import {
  getPurchaseOrder,
  decidePurchaseOrder,
  deletePurchaseOrder,
} from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

/** Any logged-in user: a single purchase order. */
export async function GET(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) return NextResponse.json({ error: "PO not found." }, { status: 404 });
  return NextResponse.json(po);
}

/** Admin only: approve (→ confirmed) or reject a pending PO.
 *  Body: { action: "approve" | "reject" }. */
export async function PATCH(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const action = (body as Record<string, unknown>)?.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'." },
      { status: 400 }
    );
  }

  const result = await decidePurchaseOrder(id, action, {
    id: me!.id,
    name: me!.name,
  });
  if (!result) {
    return NextResponse.json(
      { error: "PO not found or already decided." },
      { status: 404 }
    );
  }
  return NextResponse.json(result);
}

/** Admin only: delete a purchase order. */
export async function DELETE(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const { id } = await params;
  const ok = await deletePurchaseOrder(id);
  if (!ok) return NextResponse.json({ error: "PO not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
