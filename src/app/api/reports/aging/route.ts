import { NextResponse } from "next/server";
import { getStockAging } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { currentChannel } from "@/lib/channel";

/** Admin only: slow-moving / stuck stock in the active channel.
 *  Query: ?days=30 (default). */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const raw = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(3650, Math.floor(raw)) : 30;

  const rows = await getStockAging(await currentChannel(), days);
  return NextResponse.json({ days, rows });
}
