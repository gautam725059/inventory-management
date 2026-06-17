import { NextResponse } from "next/server";
import { updateUser } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import type { Role } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };
const ROLES: Role[] = ["admin", "staff"];

/** Admin-only: update a user's name, role, active flag, or password. */
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
  const b = body as Record<string, unknown>;

  const patch: { name?: string; role?: Role; active?: boolean; password?: string } = {};
  if (b.name !== undefined) {
    if (typeof b.name !== "string" || !b.name.trim()) {
      return NextResponse.json({ error: "Name must not be empty." }, { status: 400 });
    }
    patch.name = b.name;
  }
  if (b.role !== undefined) {
    if (!ROLES.includes(b.role as Role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    patch.role = b.role as Role;
  }
  if (b.active !== undefined) {
    if (typeof b.active !== "boolean") {
      return NextResponse.json({ error: "active must be a boolean." }, { status: 400 });
    }
    patch.active = b.active;
  }
  if (b.password !== undefined) {
    if (typeof b.password !== "string" || b.password.length < 4) {
      return NextResponse.json(
        { error: "Password must be at least 4 characters." },
        { status: 400 }
      );
    }
    patch.password = b.password;
  }

  const result = await updateUser(id, patch);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.user);
}
