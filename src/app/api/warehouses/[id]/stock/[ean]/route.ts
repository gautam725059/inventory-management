import { NextResponse } from "next/server";
import { removeStockLine } from "@/lib/db";

type Context = { params: Promise<{ id: string; ean: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  const { id, ean } = await params;
  const removed = await removeStockLine(id, ean);
  if (!removed) {
    return NextResponse.json({ error: "Stock line not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
