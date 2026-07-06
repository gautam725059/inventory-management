// Reconcile the stock of ONE product (Knife Set - Black, 8906199310604) to match
// its recorded stock-in history: per-warehouse stock = receipts − dispatches +
// adjustments. Touches ONLY this EAN. Backs up the whole store first.
//   node scripts/fix-knifeset-stock.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const EAN = "8906199310604";

function envVal(text, key) {
  const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "mi"));
  return m ? m[1].trim() : undefined;
}

async function main() {
  const env = await readFile(".env.local", "utf8");
  const uri = envVal(env, "MONGODB_URI");
  const dbName = envVal(env, "MONGODB_DB") || "inventory";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const col = client.db(dbName).collection("app");
  const store = (await col.findOne({ _id: "store" })).data;
  await writeFile("import-backup-knifeset-fix.json", JSON.stringify(store));

  const whName = (id) => store.warehouses.find((w) => w.id === id)?.name ?? id;

  // Expected per-warehouse balance from this EAN's own movements.
  const bal = new Map();
  const add = (wh, n) => bal.set(wh, (bal.get(wh) || 0) + n);
  for (const r of store.receipts) if (r.ean === EAN) add(r.warehouseId, r.quantity || 0);
  for (const d of store.dispatches) if (d.ean === EAN) add(d.warehouseId, -(d.quantity || 0));
  for (const a of store.adjustments || []) if (a.ean === EAN) add(a.warehouseId, a.quantity ?? a.delta ?? 0);
  // Transfers (in/out) if any.
  for (const t of store.transfers || []) if (t.ean === EAN) {
    if (t.toWarehouseId) add(t.toWarehouseId, t.quantity || 0);
    if (t.fromWarehouseId) add(t.fromWarehouseId, -(t.quantity || 0));
  }

  console.log("Before → After (only EAN " + EAN + "):");
  for (const [wh, want] of bal) {
    let row = store.stock.find((s) => s.ean === EAN && s.warehouseId === wh);
    const before = row ? row.quantity : 0;
    if (want <= 0) {
      if (row) store.stock = store.stock.filter((s) => !(s.ean === EAN && s.warehouseId === wh));
    } else if (row) {
      row.quantity = want;
    } else {
      store.stock.push({ warehouseId: wh, ean: EAN, quantity: want });
    }
    console.log(`  ${whName(wh)}(${wh})  ${before} → ${want}`);
  }

  const total = [...bal.values()].reduce((a, n) => a + Math.max(0, n), 0);
  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });
  console.log(`✓ Done. New total stock for ${EAN}: ${total}`);
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
