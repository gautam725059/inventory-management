import { NextResponse } from "next/server";
import { receiveStock } from "@/lib/db";
import type { ReceiveInput } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/** Parse and validate the "receive goods" request body. */
function parseBody(body: unknown): { ok: true; value: ReceiveInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;

  const ean = typeof b.ean === "string" ? b.ean.trim() : "";
  if (!ean) return { ok: false, error: "EAN is required." };
  if (!/^\d{6,14}$/.test(ean)) {
    return { ok: false, error: "EAN must be 6–14 digits." };
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

  return { ok: true, value: { ean, quantity, name, comboSizes } };
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
    const line = await receiveStock(id, result.value);
    return NextResponse.json(line, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to receive goods.";
    const status = message === "Warehouse not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
