// Reconcile e-com stock UPWARD to match recorded movements. For every
// (product, warehouse), expected = receipts − dispatches + adjustments
// + transfers-in − transfers-out. If the current stock row is BELOW expected,
// it is raised to expected. Stock is NEVER reduced (so any legit extra stays).
// Backs up the whole store first.  node scripts/reconcile-ecom-stock.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

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
  await writeFile("import-backup-ecom-stock-reconcile.json", JSON.stringify(store));

  const ecomEans = new Set(store.products.filter((p) => p.channel === "ecom").map((p) => p.ean));
  const nameOf = new Map(store.products.filter((p) => p.channel === "ecom").map((p) => [p.ean, p.name]));
  const whName = (id) => store.warehouses.find((w) => w.id === id)?.name ?? id;

  // expected[ean][warehouseId] = net movement
  const exp = new Map();
  const bump = (ean, wh, n) => {
    if (!ecomEans.has(ean)) return;
    if (!exp.has(ean)) exp.set(ean, new Map());
    const m = exp.get(ean);
    m.set(wh, (m.get(wh) || 0) + n);
  };
  for (const r of store.receipts) bump(r.ean, r.warehouseId, r.quantity || 0);
  for (const d of store.dispatches) bump(d.ean, d.warehouseId, -(d.quantity || 0));
  for (const a of store.adjustments || []) bump(a.ean, a.warehouseId, a.delta ?? a.quantity ?? 0);
  for (const t of store.transfers || []) {
    if (t.toWarehouseId) bump(t.ean, t.toWarehouseId, t.quantity || 0);
    if (t.fromWarehouseId) bump(t.ean, t.fromWarehouseId, -(t.quantity || 0));
  }

  let rowsRaised = 0, piecesAdded = 0;
  const changedEans = new Set();
  for (const [ean, m] of exp) {
    for (const [wh, want] of m) {
      if (want <= 0) continue; // nothing to add here
      let row = store.stock.find((s) => s.ean === ean && s.warehouseId === wh);
      const cur = row ? row.quantity : 0;
      if (cur >= want) continue; // already OK or higher — never reduce
      const add = want - cur;
      if (row) row.quantity = want;
      else store.stock.push({ warehouseId: wh, ean, quantity: want });
      rowsRaised++; piecesAdded += add; changedEans.add(ean);
      console.log(`  ${ean}  ${whName(wh)}  ${cur} → ${want}  (+${add})  ${nameOf.get(ean)}`);
    }
  }

  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });
  console.log(`\n✓ Reconcile done.`);
  console.log(`  products changed: ${changedEans.size}`);
  console.log(`  stock rows raised: ${rowsRaised}`);
  console.log(`  total pieces added: ${piecesAdded}`);
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
