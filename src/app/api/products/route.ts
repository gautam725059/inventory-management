import { NextResponse } from "next/server";
import { listCatalog } from "@/lib/db";
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
