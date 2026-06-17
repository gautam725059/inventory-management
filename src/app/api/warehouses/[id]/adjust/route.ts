import { NextResponse } from "next/server";
import { adjustStock } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

/** Admin only: apply a manual +/- stock correction with a reason. */
export async function POST(request: Request, { params }: Context) {
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
  const b = body as Record<string, unknown>;

  const ean = typeof b.ean === "string" ? b.ean.trim() : "";
  if (!ean) return NextResponse.json({ error: "EAN is required." }, { status: 400 });

  const delta = Number(b.delta);
  if (!Number.isInteger(delta) || delta === 0) {
    return NextResponse.json(
      { error: "Adjustment must be a non-zero whole number (+ or -)." },
      { status: 400 }
    );
  }

  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });

  const note = typeof b.note === "string" ? b.note.trim() || undefined : undefined;

  try {
    const line = await adjustStock(id, ean, delta, reason, note, {
      id: me!.id,
      name: me!.name,
    });
    return NextResponse.json(line);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to adjust stock.";
    const status = message === "Warehouse not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
