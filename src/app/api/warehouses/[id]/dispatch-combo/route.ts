import { NextResponse } from "next/server";
import { dispatchCombo } from "@/lib/db";
import { getCurrentUser, canAccessWarehouse } from "@/lib/auth";
import type { ComboDispatchInput } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/** Parse and validate the "dispatch combo" request body. */
function parseBody(
  body: unknown
): { ok: true; value: ComboDispatchInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;

  const comboId = typeof b.comboId === "string" ? b.comboId.trim() : "";
  if (!comboId) return { ok: false, error: "Combo is required." };

  const combos = Number(b.combos);
  if (!Number.isInteger(combos) || combos <= 0) {
    return { ok: false, error: "Number of combos must be a positive whole number." };
  }

  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!date) return { ok: false, error: "Date is required." };

  const invoiceNo = typeof b.invoiceNo === "string" ? b.invoiceNo.trim() : "";
  if (!invoiceNo) return { ok: false, error: "Invoice number is required." };

  const referenceNo =
    typeof b.referenceNo === "string" ? b.referenceNo.trim() || undefined : undefined;
  const customerName =
    typeof b.customerName === "string" ? b.customerName.trim() || undefined : undefined;

  return {
    ok: true,
    value: { comboId, combos, date, invoiceNo, referenceNo, customerName },
  };
}

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

  const result = parseBody(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const record = await dispatchCombo(id, result.value);
    return NextResponse.json(record, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to dispatch combo.";
    const status = message === "Warehouse not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
