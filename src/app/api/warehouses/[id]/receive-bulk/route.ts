import { NextResponse } from "next/server";
import { receiveStockBulk } from "@/lib/db";
import { getCurrentUser, canAccessWarehouse } from "@/lib/auth";
import type { BulkReceiveLine } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

const MAX_LINES = 20;

/** Any logged-in user: receive several products into a warehouse at once. */
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

  const bill = typeof b.bill === "string" ? b.bill.trim() : "";
  if (!bill) return NextResponse.json({ error: "Bill number is required." }, { status: 400 });
  const vendorName = typeof b.vendorName === "string" ? b.vendorName.trim() : "";
  if (!vendorName) return NextResponse.json({ error: "Vendor name is required." }, { status: 400 });
  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!date) return NextResponse.json({ error: "Date is required." }, { status: 400 });

  if (!Array.isArray(b.lines) || b.lines.length === 0) {
    return NextResponse.json({ error: "Add at least one line." }, { status: 400 });
  }
  if (b.lines.length > MAX_LINES) {
    return NextResponse.json(
      { error: `Up to ${MAX_LINES} lines at a time.` },
      { status: 400 }
    );
  }

  const lines: BulkReceiveLine[] = (b.lines as BulkReceiveLine[]).map((l) => ({
    ean: String(l.ean ?? ""),
    quantity: Number(l.quantity) || 0,
    purchasePrice:
      l.purchasePrice != null && l.purchasePrice !== ("" as unknown)
        ? Number(l.purchasePrice)
        : undefined,
    name: typeof l.name === "string" ? l.name : undefined,
  }));

  try {
    const result = await receiveStockBulk(
      id,
      { bill, vendorName, date, lines },
      { id: me.id, name: me.name }
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to receive goods.";
    const status = message === "Warehouse not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
