import { NextResponse } from "next/server";
import { listUsers, createUser } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import type { Role } from "@/lib/types";

const ROLES: Role[] = ["admin", "staff"];

/** Admin-only: list all users. */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  return NextResponse.json(await listUsers());
}

/** Admin-only: create a user. */
export async function POST(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const username = typeof b.username === "string" ? b.username.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const role = b.role as Role;
  const password = typeof b.password === "string" ? b.password : "";
  const warehouseId =
    typeof b.warehouseId === "string" ? b.warehouseId.trim() : undefined;

  if (!/^[a-zA-Z0-9._-]{3,}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3+ chars (letters, numbers, . _ -)." },
      { status: 400 }
    );
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json(
      { error: "Password must be at least 4 characters." },
      { status: 400 }
    );
  }

  const result = await createUser({ username, name, role, password, warehouseId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json(result.user, { status: 201 });
}
