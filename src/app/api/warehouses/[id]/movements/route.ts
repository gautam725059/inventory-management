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
    const TYPE_LABEL: Record<string, string> = {
      in: "Stock In",
      out: "Stock Out",
      adjust: "Adjustment",
      "transfer-in": "Transfer In",
      "transfer-out": "Transfer Out",
    };
    const headers = [
      "Date",
      "Type",
      "Product",
      "EAN",
      "Pack size",
      "Packs",
      "Pieces",
      "Invoice no",
      "Customer",
      "Vendor",
      "Bill no",
      "Doc date",
      "Reason / Counterparty",
      "Note",
      "By",
    ];
    const rows = movements.map((m) => {
      const dir =
        m.type === "out" || m.type === "transfer-out" ? -1 : 1;
      const signed = m.type === "adjust" ? m.quantity : dir * m.quantity;
      return [
        m.createdAt,
        TYPE_LABEL[m.type] ?? m.type,
        m.name,
        m.ean,
        m.unitSize ?? "",
        m.packs ?? "",
        (signed >= 0 ? "+" : "-") + Math.abs(signed),
        m.invoiceNo ?? "",
        m.customerName ?? "",
        m.vendorName ?? "",
        m.bill ?? "",
        m.date ?? "",
        m.reason ?? m.counterparty ?? "",
        m.note ?? "",
        m.byName ?? "",
      ];
    });
    return csvResponse(`movements-${id}.csv`, toCsv(headers, rows));
  }

  return NextResponse.json(movements);
}
