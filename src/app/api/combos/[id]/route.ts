import { NextResponse } from "next/server";
import { updateCombo, deleteCombo } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { ComboInput } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

/** Any logged-in user (admin or staff): update a combo. */
export async function PATCH(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await updateCombo(id, body as ComboInput);
  if (!result.ok) {
    const status = result.error === "Combo not found." ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result.combo);
}

/** Any logged-in user (admin or staff): delete a combo. */
export async function DELETE(request: Request, { params }: Context) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await params;
  const ok = await deleteCombo(id);
  if (!ok) return NextResponse.json({ error: "Combo not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
