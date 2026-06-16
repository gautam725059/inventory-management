import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Password hashing with Node's scrypt. Stored format: "<saltHex>:<hashHex>".
// Kept free of other imports so both the auth layer and the db seed can use it
// without an import cycle.
// ---------------------------------------------------------------------------

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, KEY_LEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
