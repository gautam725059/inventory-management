import { NextResponse } from "next/server";
import { getWarehouseDetail } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const detail = await getWarehouseDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Warehouse not found." }, { status: 404 });
  }
  return NextResponse.json(detail);
}
