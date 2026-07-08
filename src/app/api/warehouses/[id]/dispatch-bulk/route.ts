import { NextResponse } from "next/server";
import { dispatchStockBulk } from "@/lib/db";
import { getCurrentUser, canAccessWarehouse } from "@/lib/auth";
import type { BulkDispatchInput, BulkDispatchLine } from "@/lib/types";

const MAX_LINES = 10;

type Context = { params: Promise<{ id: string }> };

function parseBody(
  body: unknown
): { ok: true; value: BulkDispatchInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;

  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!date) return { ok: false, error: "Date is required." };

  const invoiceNo = typeof b.invoiceNo === "string" ? b.invoiceNo.trim() : "";
  if (!invoiceNo) return { ok: false, error: "Invoice number is required." };

  const referenceNo =
    typeof b.referenceNo === "string" ? b.referenceNo.trim() || undefined : undefined;
  const customerName =
    typeof b.customerName === "string" ? b.customerName.trim() || undefined : undefined;

  if (!Array.isArray(b.lines) || b.lines.length === 0) {
    return { ok: false, error: "Add at least one product line." };
  }
  if (b.lines.length > MAX_LINES) {
    return { ok: false, error: `Up to ${MAX_LINES} lines at a time.` };
  }

  const lines: BulkDispatchLine[] = [];
  for (let i = 0; i < b.lines.length; i++) {
    const raw = b.lines[i] as Record<string, unknown>;
    const ean = typeof raw?.ean === "string" ? raw.ean.trim() : "";
    if (!ean) return { ok: false, error: `Line ${i + 1}: EAN is required.` };
    const unitSize = Number(raw?.unitSize);
    if (!Number.isInteger(unitSize) || unitSize <= 0) {
      return { ok: false, error: `Line ${i + 1}: pack size must be a positive whole number.` };
    }
    const packs = Number(raw?.packs);
    if (!Number.isInteger(packs) || packs <= 0) {
      return { ok: false, error: `Line ${i + 1}: number of packs must be a positive whole number.` };
    }
    lines.push({ ean, unitSize, packs });
  }

  return { ok: true, value: { date, invoiceNo, referenceNo, customerName, lines } };
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

  const parsed = parseBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await dispatchStockBulk(id, parsed.value, { id: me.id, name: me.name });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to dispatch.";
    const status = message === "Warehouse not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
