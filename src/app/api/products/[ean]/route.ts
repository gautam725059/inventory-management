import { NextResponse } from "next/server";
import { updateProduct } from "@/lib/db";
import type { ProductUpdateInput } from "@/lib/types";

type Context = { params: Promise<{ ean: string }> };

/** Parse the product-update body. All fields are optional. */
function parseBody(
  body: unknown
): { ok: true; value: ProductUpdateInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;
  const value: ProductUpdateInput = {};

  if (b.name !== undefined) {
    if (typeof b.name !== "string" || !b.name.trim()) {
      return { ok: false, error: "Name must be a non-empty string." };
    }
    value.name = b.name.trim();
  }

  if (b.comboSizes !== undefined) {
    if (!Array.isArray(b.comboSizes)) {
      return { ok: false, error: "comboSizes must be an array." };
    }
    value.comboSizes = b.comboSizes
      .map((s) => Number(s))
      .filter((s) => Number.isInteger(s) && s > 0);
  }

  if (b.reorderLevel !== undefined) {
    const n = Number(b.reorderLevel);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: "Reorder level must be a non-negative integer." };
    }
    value.reorderLevel = n;
  }

  return { ok: true, value };
}

export async function PUT(request: Request, { params }: Context) {
  const { ean } = await params;

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

  const ok = await updateProduct(ean, result.value);
  if (!ok) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
