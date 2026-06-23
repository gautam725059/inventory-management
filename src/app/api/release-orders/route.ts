import { NextResponse } from "next/server";
import { listReleaseOrders, createReleaseOrder } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { ReleaseOrderInput, ROLineInput } from "@/lib/types";

const MAX_LINES = 10;

/** Any logged-in user: list release orders (newest first). */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json(await listReleaseOrders());
}

/** Any logged-in user (incl. staff): create an RO → dispatches stock. */
export async function POST(request: Request) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  if (typeof b.warehouseId !== "string" || !b.warehouseId.trim()) {
    return NextResponse.json({ error: "Warehouse is required." }, { status: 400 });
  }
  if (!Array.isArray(b.lines) || b.lines.length === 0) {
    return NextResponse.json({ error: "Add at least one line." }, { status: 400 });
  }
  if (b.lines.length > MAX_LINES) {
    return NextResponse.json(
      { error: `Up to ${MAX_LINES} lines at a time.` },
      { status: 400 }
    );
  }

  const input: ReleaseOrderInput = {
    date: typeof b.date === "string" ? b.date : "",
    source: typeof b.source === "string" ? b.source : undefined,
    warehouseId: b.warehouseId,
    customerName: typeof b.customerName === "string" ? b.customerName : undefined,
    cartDiscount: typeof b.cartDiscount === "number" ? b.cartDiscount : 0,
    lines: (b.lines as ROLineInput[]).map((l) => ({
      itemCode: typeof l.itemCode === "string" ? l.itemCode : undefined,
      ean: String(l.ean ?? ""),
      description: typeof l.description === "string" ? l.description : undefined,
      grammage: typeof l.grammage === "string" ? l.grammage : undefined,
      gstRate: Number(l.gstRate) || 0,
      landingRate: Number(l.landingRate) || 0,
      quantity: Number(l.quantity) || 0,
      mrp: l.mrp != null ? Number(l.mrp) : undefined,
    })),
  };

  const result = await createReleaseOrder(input, { id: me.id, name: me.name });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.ro, { status: 201 });
}
