import { NextResponse } from "next/server";
import { listWarehouses } from "@/lib/db";
import { currentChannel } from "@/lib/channel";
import type { Channel } from "@/lib/types";

export async function GET(req: Request) {
  // An explicit ?channel= wins; otherwise fall back to the channel cookie.
  const param = new URL(req.url).searchParams.get("channel");
  const channel: Channel =
    param === "b2b" ? "b2b" : param === "ecom" ? "ecom" : await currentChannel();
  const warehouses = await listWarehouses(channel);
  return NextResponse.json(warehouses);
}
