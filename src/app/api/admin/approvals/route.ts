import { NextResponse } from "next/server";
import { listApprovals } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

/** Admin/manager: list all stock-in approval requests (newest first). */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin", "manager")) {
    return NextResponse.json({ error: "Admin or manager only." }, { status: 403 });
  }
  return NextResponse.json(await listApprovals());
}
