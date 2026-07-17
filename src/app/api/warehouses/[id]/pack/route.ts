import { NextResponse } from "next/server";
import { createReleaseOrder } from "@/lib/db";
import { getCurrentUser, canAccessWarehouse } from "@/lib/auth";
import type { ReleaseOrderInput } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/** Manual "Pack" — reserve stock for a counter/manual dispatch. Instead of
 *  deducting immediately, this creates a Release Order (source = the reference
 *  or "Counter") that is force-approved so its lines start "packed". The
 *  warehouse team then dispatches → delivers each line from the RO, just like a
 *  platform RO. Any user with access to the warehouse can pack. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!canAccessWarehouse(me, id)) {
    return NextResponse.json(
      { error: "You don't have access to this warehouse." },
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

  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!date) return NextResponse.json({ error: "Date is required." }, { status: 400 });

  const reference = typeof b.reference === "string" ? b.reference.trim() : "";
  const customerName = typeof b.customerName === "string" ? b.customerName.trim() : "";
  if (!Array.isArray(b.lines) || b.lines.length === 0) {
    return NextResponse.json({ error: "Add at least one product to pack." }, { status: 400 });
  }

  const input: ReleaseOrderInput = {
    date,
    source: reference || "Counter",
    warehouseId: id,
    customerName: customerName || undefined,
    cartDiscount: 0,
    lines: (b.lines as { ean?: unknown; quantity?: unknown }[]).map((l) => ({
      ean: String(l.ean ?? ""),
      quantity: Number(l.quantity) || 0,
    })),
  };

  // Force-approved (isAdmin=true): the RO starts "approved" with every line
  // "packed" — reserved, not deducted — regardless of who packs it.
  const result = await createReleaseOrder(input, { id: me.id, name: me.name }, true);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.ro, { status: 201 });
}
