import { NextResponse } from "next/server";
import { listWarehouses } from "@/lib/db";
import { getCurrentUser, canAccessWarehouse } from "@/lib/auth";
import { currentChannel } from "@/lib/channel";
import type { Channel } from "@/lib/types";

export async function GET(req: Request) {
  const me = await getCurrentUser(req);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  // An explicit ?channel= wins; otherwise fall back to the channel cookie.
  const param = new URL(req.url).searchParams.get("channel");
  const channel: Channel =
    param === "b2b" ? "b2b" : param === "ecom" ? "ecom" : await currentChannel();
  const all = await listWarehouses(channel);
  // Staff only see their assigned warehouse; admins see all.
  const warehouses = all.filter((w) => canAccessWarehouse(me, w.id));
  return NextResponse.json(warehouses);
}
