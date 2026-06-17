import { NextResponse } from "next/server";
import { transferStock } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

/** Admin only: transfer stock from one warehouse to another. */
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
  const b = body as Record<string, unknown>;

  const fromWarehouseId =
    typeof b.fromWarehouseId === "string" ? b.fromWarehouseId.trim() : "";
  const toWarehouseId =
    typeof b.toWarehouseId === "string" ? b.toWarehouseId.trim() : "";
  const ean = typeof b.ean === "string" ? b.ean.trim() : "";
  if (!fromWarehouseId || !toWarehouseId || !ean) {
    return NextResponse.json(
      { error: "Source, destination, and EAN are required." },
      { status: 400 }
    );
  }
  if (fromWarehouseId === toWarehouseId) {
    return NextResponse.json(
      { error: "Source and destination warehouses must differ." },
      { status: 400 }
    );
  }

  const quantity = Number(b.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json(
      { error: "Quantity must be a positive whole number." },
      { status: 400 }
    );
  }

  const note = typeof b.note === "string" ? b.note.trim() || undefined : undefined;

  try {
    const result = await transferStock(
      fromWarehouseId,
      toWarehouseId,
      ean,
      quantity,
      note,
      { id: me!.id, name: me!.name }
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to transfer stock.";
    const status = message === "Warehouse not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
