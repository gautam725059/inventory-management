import { NextResponse } from "next/server";
import { removeStockLine } from "@/lib/db";
import { getCurrentUser, canAccessWarehouse } from "@/lib/auth";

type Context = { params: Promise<{ id: string; ean: string }> };

export async function DELETE(request: Request, { params }: Context) {
  const { id, ean } = await params;
  const me = await getCurrentUser(request);
  if (!canAccessWarehouse(me, id)) {
    return NextResponse.json(
      { error: "You don't have access to this warehouse." },
      { status: 403 }
    );
  }
  const removed = await removeStockLine(id, ean);
  if (!removed) {
    return NextResponse.json({ error: "Stock line not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
