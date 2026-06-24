import { NextResponse } from "next/server";
import { listCombos, createCombo } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { currentChannel } from "@/lib/channel";
import type { ComboInput } from "@/lib/types";

/** Any logged-in user: list combos (with component names). */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json(await listCombos(await currentChannel()));
}

/** Any logged-in user (admin or staff): create a combo. */
export async function POST(request: Request) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await createCombo(body as ComboInput, await currentChannel());
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.combo, { status: 201 });
}
