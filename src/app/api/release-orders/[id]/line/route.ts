import { NextResponse } from "next/server";
import { getReleaseOrder, updateROLineStatus } from "@/lib/db";
import { getCurrentUser, canAccessWarehouse } from "@/lib/auth";
import type { ROFulfillment } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

const NEXT: ROFulfillment[] = ["dispatched", "delivered"];

/** Advance one RO line through the fulfillment pipeline (warehouse team):
 *  packed → dispatched (deducts stock) → delivered. Any user with access to the
 *  RO's warehouse can do this. Body: { itemIndex: number, to: "dispatched" | "delivered" }. */
export async function PATCH(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await params;
  const ro = await getReleaseOrder(id);
  if (!ro) return NextResponse.json({ error: "RO not found." }, { status: 404 });
  if (!canAccessWarehouse(me, ro.warehouseId)) {
    return NextResponse.json(
      { error: "You don't have access to this RO's warehouse." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const itemIndex = Number(b.itemIndex);
  const to = b.to as ROFulfillment;
  if (!Number.isInteger(itemIndex) || itemIndex < 0) {
    return NextResponse.json({ error: "itemIndex must be a valid line number." }, { status: 400 });
  }
  if (!NEXT.includes(to)) {
    return NextResponse.json(
      { error: "to must be 'dispatched' or 'delivered'." },
      { status: 400 }
    );
  }

  const result = await updateROLineStatus(id, itemIndex, to, { id: me.id, name: me.name });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.ro);
}
