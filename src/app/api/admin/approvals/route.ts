import { NextResponse } from "next/server";
import { listApprovals } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { currentChannel } from "@/lib/channel";

/** Admin only: list all stock-in approval requests (newest first). */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  return NextResponse.json(await listApprovals(await currentChannel()));
}
