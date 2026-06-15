import { NextResponse } from "next/server";
import { getWarehouseMovements } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const movements = await getWarehouseMovements(id);
  if (!movements) {
    return NextResponse.json({ error: "Warehouse not found." }, { status: 404 });
  }
  return NextResponse.json(movements);
}
