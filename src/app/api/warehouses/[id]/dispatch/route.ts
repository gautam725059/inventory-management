import { NextResponse } from "next/server";
import { dispatchStock } from "@/lib/db";
import type { DispatchInput } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/** Parse and validate the "dispatch goods" (stock-out) request body. */
function parseBody(
  body: unknown
): { ok: true; value: DispatchInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;

  const ean = typeof b.ean === "string" ? b.ean.trim() : "";
  if (!ean) return { ok: false, error: "EAN is required." };

  const unitSize = Number(b.unitSize);
  if (!Number.isInteger(unitSize) || unitSize <= 0) {
    return { ok: false, error: "Pack size must be a positive whole number." };
  }

  const packs = Number(b.packs);
  if (!Number.isInteger(packs) || packs <= 0) {
    return { ok: false, error: "Number of packs must be a positive whole number." };
  }

  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!date) return { ok: false, error: "Date is required." };

  const invoiceNo = typeof b.invoiceNo === "string" ? b.invoiceNo.trim() : "";
  if (!invoiceNo) return { ok: false, error: "Invoice number is required." };

  const customerName =
    typeof b.customerName === "string" ? b.customerName.trim() || undefined : undefined;

  return {
    ok: true,
    value: { ean, unitSize, packs, date, invoiceNo, customerName },
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

  try {
    const line = await dispatchStock(id, result.value);
    return NextResponse.json(line, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to dispatch goods.";
    const status = message === "Warehouse not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
