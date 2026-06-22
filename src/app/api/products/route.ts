import { NextResponse } from "next/server";
import { listCatalog, deleteProducts } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET(request: Request) {
  const catalog = await listCatalog();

  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    const warehouseNames = catalog[0]?.byWarehouse.map((b) => b.warehouseName) ?? [];
    const headers = [
      "Product",
      "EAN",
      "Total pieces",
      ...warehouseNames,
      "Combo sizes",
      "Reorder level",
      "Low stock",
    ];
    const rows = catalog.map((p) => [
      p.name,
      p.ean,
      p.totalQuantity,
      ...p.byWarehouse.map((b) => b.quantity),
      p.comboSizes.join(" / "),
      p.reorderLevel,
      p.lowStock ? "YES" : "",
    ]);
    return csvResponse("catalog.csv", toCsv(headers, rows));
  }

  return NextResponse.json(catalog);
}

/** Bulk-delete products by EAN. Body: { eans: string[] }. */
export async function DELETE(request: Request) {
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
  const eans = Array.isArray(b.eans)
    ? b.eans.filter((e): e is string => typeof e === "string")
    : [];
  if (eans.length === 0) {
    return NextResponse.json({ error: "No products selected." }, { status: 400 });
  }

  const deleted = await deleteProducts(eans);
  return NextResponse.json({ deleted });
}
