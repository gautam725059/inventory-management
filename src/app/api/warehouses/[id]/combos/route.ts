import { NextResponse } from "next/server";
import { setComboSizes } from "@/lib/db";

// Combo (pack) sizes are a product-level attribute, shared across warehouses.
// The [id] segment is kept for a consistent URL shape from the warehouse page.
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const ean = typeof b.ean === "string" ? b.ean.trim() : "";
  if (!ean) return NextResponse.json({ error: "EAN is required." }, { status: 400 });

  if (!Array.isArray(b.comboSizes)) {
    return NextResponse.json({ error: "comboSizes must be an array." }, { status: 400 });
  }
  const comboSizes = b.comboSizes
    .map((s) => Number(s))
    .filter((s) => Number.isInteger(s) && s > 0);

  const ok = await setComboSizes(ean, comboSizes);
  if (!ok) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, comboSizes });
}
