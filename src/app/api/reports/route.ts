import { NextResponse } from "next/server";
import { getReports } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { currentChannel } from "@/lib/channel";

/** Admin only: business report. Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD. */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  return NextResponse.json(await getReports(from, to, await currentChannel()));
}
