import { NextResponse } from "next/server";
import { getValuation, listCatalog } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

/** Admin only: inventory valuation (per-product + grand totals) plus the
 *  full product catalog. */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const [valuation, products] = await Promise.all([
    getValuation(),
    listCatalog(),
  ]);
  return NextResponse.json({ valuation, products });
}
