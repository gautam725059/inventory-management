import { NextResponse } from "next/server";
import { getCustomerDetail, updateCustomer } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

/** Any logged-in user: a customer with its sales history. */
export async function GET(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const detail = await getCustomerDetail(id);
  if (!detail) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  return NextResponse.json(detail);
}

/** Admin only: update a customer. */
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
  const result = await updateCustomer(id, body as Record<string, string>);
  if (!result.ok) {
    const status = result.error === "Not found." ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result.party);
}
