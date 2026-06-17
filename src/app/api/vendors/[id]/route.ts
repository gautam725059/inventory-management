import { NextResponse } from "next/server";
import { getVendorDetail, updateVendor } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

/** Any logged-in user: a vendor with its purchase history. */
export async function GET(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const detail = await getVendorDetail(id);
  if (!detail) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
  return NextResponse.json(detail);
}

/** Admin only: update a vendor. */
export async function PATCH(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const result = await updateVendor(id, body as Record<string, string>);
  if (!result.ok) {
    const status = result.error === "Not found." ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result.party);
}
