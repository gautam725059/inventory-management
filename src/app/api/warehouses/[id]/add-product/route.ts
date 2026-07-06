import { NextResponse } from "next/server";
import { receiveStock, createApproval } from "@/lib/db";
import { getCurrentUser, hasRole, canAccessWarehouse } from "@/lib/auth";
import type { ReceiveInput } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/** Add a brand-new product with its opening stock. Admins apply it directly;
 *  staff submit it for admin approval (queued as a stock-in approval). */
export async function POST(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await params;
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

  const ean = typeof b.ean === "string" ? b.ean.trim() : "";
  if (!ean || !/^[A-Za-z0-9][A-Za-z0-9-]{2,23}$/.test(ean)) {
    return NextResponse.json({ error: "Enter a valid product code." }, { status: 400 });
  }
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Product name is required." }, { status: 400 });

  const quantity = Number(b.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Quantity must be a positive whole number." }, { status: 400 });
  }
  const vendorName = typeof b.vendorName === "string" ? b.vendorName.trim() : "";
  if (!vendorName) return NextResponse.json({ error: "Vendor name is required." }, { status: 400 });
  const bill = typeof b.bill === "string" ? b.bill.trim() : "";
  if (!bill) return NextResponse.json({ error: "Bill number is required." }, { status: 400 });
  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!date) return NextResponse.json({ error: "Date is required." }, { status: 400 });

  let purchasePrice: number | undefined;
  if (b.purchasePrice !== undefined && b.purchasePrice !== "") {
    const n = Number(b.purchasePrice);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "Purchase price must be a non-negative number." }, { status: 400 });
    }
    purchasePrice = n;
  }

  const input: ReceiveInput = { ean, quantity, name, vendorName, bill, date, purchasePrice };

  // Admins apply directly; staff queue for approval.
  if (hasRole(me, "admin")) {
    try {
      const line = await receiveStock(id, input);
      return NextResponse.json({ applied: true, line }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add product.";
      const status = message === "Warehouse not found." ? 404 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const approval = await createApproval(id, input, { id: me.id, name: me.name });
  return NextResponse.json({ pending: true, approval }, { status: 202 });
}
