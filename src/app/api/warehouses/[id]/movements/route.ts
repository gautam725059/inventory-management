import { NextResponse } from "next/server";
import { getWarehouseMovements } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const movements = await getWarehouseMovements(id);
  if (!movements) {
    return NextResponse.json({ error: "Warehouse not found." }, { status: 404 });
  }

  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    const headers = ["Date", "Type", "Product", "EAN", "Pack size", "Packs", "Pieces"];
    const rows = movements.map((m) => [
      m.createdAt,
      m.type === "in" ? "Stock In" : "Stock Out",
      m.name,
      m.ean,
      m.unitSize ?? "",
      m.packs ?? "",
      (m.type === "in" ? "+" : "-") + m.quantity,
    ]);
    return csvResponse(`movements-${id}.csv`, toCsv(headers, rows));
  }

  return NextResponse.json(movements);
}
