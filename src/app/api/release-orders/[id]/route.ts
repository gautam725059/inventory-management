import { NextResponse } from "next/server";
import { getReleaseOrder, deleteReleaseOrder } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

/** Any logged-in user: a single release order. */
export async function GET(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const ro = await getReleaseOrder(id);
  if (!ro) return NextResponse.json({ error: "RO not found." }, { status: 404 });
  return NextResponse.json(ro);
}

/** Admin only: delete a release order record (does not restore stock). */
export async function DELETE(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const { id } = await params;
  const ok = await deleteReleaseOrder(id);
  if (!ok) return NextResponse.json({ error: "RO not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
