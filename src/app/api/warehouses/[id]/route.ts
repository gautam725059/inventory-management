import { NextResponse } from "next/server";
import { getWarehouseDetail } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const detail = await getWarehouseDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Warehouse not found." }, { status: 404 });
  }

  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    const headers = [
      "Product",
      "EAN",
      "Pieces",
      "Combo sizes",
      "Reorder level",
      "Low stock",
    ];
    const rows = detail.lines.map((l) => [
      l.name,
      l.ean,
      l.quantity,
      l.comboSizes.join(" / "),
      l.reorderLevel,
      l.lowStock ? "YES" : "",
    ]);
    const safeName = detail.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return csvResponse(`stock-${safeName}.csv`, toCsv(headers, rows));
  }

  return NextResponse.json(detail);
}
