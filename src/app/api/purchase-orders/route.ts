import { NextResponse } from "next/server";
import { listPurchaseOrders, createPurchaseOrder } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { currentChannel } from "@/lib/channel";
import type { PurchaseOrderInput } from "@/lib/types";

/** Any logged-in user: list purchase orders (newest first). */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json(await listPurchaseOrders(await currentChannel()));
}

/** Any logged-in user: create a PO. Admins → confirmed; staff → pending. */
export async function POST(request: Request) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await createPurchaseOrder(
    body as PurchaseOrderInput,
    { id: me.id, name: me.name },
    hasRole(me, "admin"),
    await currentChannel()
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.po, { status: 201 });
}
