import { NextResponse } from "next/server";
import { decideApproval } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

/** Admin only: approve or reject a pending stock-in. Approving applies the
 *  receive to stock. Body: { action: "approve" | "reject" }. */
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
  const action = (body as Record<string, unknown>)?.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'." },
      { status: 400 }
    );
  }

  const result = await decideApproval(id, action, { id: me!.id, name: me!.name });
  if (!result) {
    return NextResponse.json(
      { error: "Request not found or already decided." },
      { status: 404 }
    );
  }
  return NextResponse.json(result);
}
