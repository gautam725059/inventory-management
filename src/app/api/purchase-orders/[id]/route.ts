import { NextResponse } from "next/server";
import {
  getPurchaseOrder,
  decidePurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrder,
  receivePurchaseOrder,
} from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import type { PurchaseOrderInput } from "@/lib/types";

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

/** Admin only: act on a PO. Body: { action: "approve" | "reject" | "receive",
 *  warehouseId? }. "receive" stocks the goods into inventory. */
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
  const b = body as Record<string, unknown>;
  const action = b?.action;

  if (action === "receive") {
    const warehouseId =
      typeof b.warehouseId === "string" && b.warehouseId.trim()
        ? b.warehouseId.trim()
        : undefined;
    const result = await receivePurchaseOrder(
      id,
      { id: me!.id, name: me!.name },
      warehouseId
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result.po);
  }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve', 'reject' or 'receive'." },
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

/** Admin only: edit a PO's header / line items (qty, price, product). */
export async function PUT(request: Request, { params }: Context) {
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
  const b = body as Partial<PurchaseOrderInput> & { warehouseId?: string | null };

  const result = await updatePurchaseOrder(id, {
    date: typeof b.date === "string" ? b.date : undefined,
    vendorName: typeof b.vendorName === "string" ? b.vendorName : undefined,
    invoiceNumber:
      typeof b.invoiceNumber === "string" ? b.invoiceNumber : undefined,
    warehouseId: b.warehouseId === undefined ? undefined : b.warehouseId,
    items: Array.isArray(b.items) ? b.items : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.po);
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
