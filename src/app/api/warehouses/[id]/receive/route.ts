import { NextResponse } from "next/server";
import { receiveStock } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { ReceiveInput } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/** Parse and validate the "receive goods" request body. */
function parseBody(body: unknown): { ok: true; value: ReceiveInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;

  const ean = typeof b.ean === "string" ? b.ean.trim() : "";
  if (!ean) return { ok: false, error: "Product code is required." };
  // Accept a numeric EAN (e-com) or an alphanumeric SKU / 12NC (B2B). The code
  // is resolved within the warehouse's own channel downstream.
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,23}$/.test(ean)) {
    return { ok: false, error: "Invalid product code." };
  }

  const quantity = Number(b.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "Quantity must be a positive whole number." };
  }

  const name = typeof b.name === "string" ? b.name.trim() : undefined;

  let comboSizes: number[] | undefined;
  if (Array.isArray(b.comboSizes)) {
    comboSizes = b.comboSizes
      .map((s) => Number(s))
      .filter((s) => Number.isInteger(s) && s > 0);
  }

  const vendorName = typeof b.vendorName === "string" ? b.vendorName.trim() : "";
  if (!vendorName) return { ok: false, error: "Vendor name is required." };

  const bill = typeof b.bill === "string" ? b.bill.trim() : "";
  if (!bill) return { ok: false, error: "Bill number is required." };

  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!date) return { ok: false, error: "Date is required." };

  let purchasePrice: number | undefined;
  if (b.purchasePrice !== undefined && b.purchasePrice !== "") {
    const n = Number(b.purchasePrice);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Purchase price must be a non-negative number." };
    }
    purchasePrice = n;
  }

  return {
    ok: true,
    value: {
      ean,
      quantity,
      name,
      comboSizes,
      vendorName,
      bill,
      date,
      purchasePrice,
    },
  };
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = parseBody(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Any logged-in user can receive stock directly (no approval needed).
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const line = await receiveStock(id, result.value);
    return NextResponse.json(line, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to receive goods.";
    const status = message === "Warehouse not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
