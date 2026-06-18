import { NextResponse } from "next/server";
import { updateProduct } from "@/lib/db";
import type { ProductUpdateInput, PackBarcode } from "@/lib/types";

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

  if (b.barcodes !== undefined) {
    if (!Array.isArray(b.barcodes)) {
      return { ok: false, error: "barcodes must be an array." };
    }
    const barcodes: PackBarcode[] = [];
    const seen = new Set<string>();
    for (const item of b.barcodes) {
      if (typeof item !== "object" || item === null) {
        return { ok: false, error: "Each barcode must be an object." };
      }
      const row = item as Record<string, unknown>;
      const ean =
        typeof row.ean === "string" ? row.ean.trim() : String(row.ean ?? "").trim();
      const size = Number(row.size);
      if (!ean) {
        return { ok: false, error: "Each barcode needs an EAN." };
      }
      if (!Number.isInteger(size) || size <= 0) {
        return { ok: false, error: `Pack size for ${ean} must be a positive whole number.` };
      }
      if (seen.has(ean)) {
        return { ok: false, error: `Duplicate barcode: ${ean}.` };
      }
      seen.add(ean);
      const name =
        typeof row.name === "string" ? row.name.trim() || undefined : undefined;
      let price: number | undefined;
      if (row.price !== undefined && row.price !== "") {
        const p = Number(row.price);
        if (!Number.isFinite(p) || p < 0) {
          return { ok: false, error: `Price for ${ean} must be a non-negative number.` };
        }
        price = p;
      }
      barcodes.push({ ean, size, name, price });
    }
    value.barcodes = barcodes;
  }

  if (b.reorderLevel !== undefined) {
    const n = Number(b.reorderLevel);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: "Reorder level must be a non-negative integer." };
    }
    value.reorderLevel = n;
  }

  if (b.sellingPrice !== undefined && b.sellingPrice !== "") {
    const n = Number(b.sellingPrice);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Selling price must be a non-negative number." };
    }
    value.sellingPrice = n;
  }

  if (b.imageUrl !== undefined) {
    if (typeof b.imageUrl !== "string") {
      return { ok: false, error: "imageUrl must be a string." };
    }
    value.imageUrl = b.imageUrl.trim();
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
