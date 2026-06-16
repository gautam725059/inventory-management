// One-time migration: import data/store.json into MongoDB as a single document.
// Usage:  node scripts/migrate-to-mongo.mjs
//
// Reads MONGODB_URI (and optional MONGODB_DB) from .env.local. Safe to re-run —
// it replaces the single "store" document. The app also auto-imports on its
// first Mongo connection, so this script is mainly for explicit control.

import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  let env = {};
  try {
    env = parseEnv(await readFile(".env.local", "utf8"));
  } catch {
    // ignore — fall back to process.env
  }
  const uri = process.env.MONGODB_URI || env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || env.MONGODB_DB || "inventory";

  if (!uri) {
    console.error("✗ MONGODB_URI not found in .env.local or environment.");
    process.exit(1);
  }
  if (uri.includes("<")) {
    console.error(
      "✗ MONGODB_URI still has a placeholder (e.g. <db_password>). Put the real password in .env.local first."
    );
    process.exit(1);
  }

  const raw = await readFile("data/store.json", "utf8");
  const store = JSON.parse(raw);

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const col = client.db(dbName).collection("app");
    await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });
    const counts = Object.fromEntries(
      Object.entries(store).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])
    );
    console.log(`✓ Imported store.json into "${dbName}" → app/store`);
    console.log("  records:", JSON.stringify(counts));
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("✗ Migration failed:", err.message);
  process.exit(1);
});
