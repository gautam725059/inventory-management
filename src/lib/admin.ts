// ---------------------------------------------------------------------------
// The initial admin password used to seed the first "admin" user on a fresh
// store. Override in .env.local with ADMIN_PASSWORD before first run.
// ---------------------------------------------------------------------------

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() || "admin123";
}
