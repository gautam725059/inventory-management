// Turn the "Crown + Sash" sets into single products: the combined (non-yellow)
// EAN is the MASTER; each component (yellow) EAN becomes a size-1 barcode on it
// (stock-in via the components, stock-out via the combined EAN — one shared
// stock pool). Any stock sitting on a component product is migrated to the
// master, then the standalone component product is removed.
// Idempotent. Backs up first.  node scripts/setup-ecom-sash-sets.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const CHANNEL = "ecom";

// [ masterEan, masterName, [ [componentEan, componentName], ... ] ]
const GROUPS = [
  ["8906199313087", "Rose Gold Birthday Girl Crown & Sash by Shanya", [
    ["8906199313537", "Gold Crown A"],
    ["8906199313544", "Gold Sash"],
  ]],
  ["8906199311823", "Birthday Girl Sash & Crown by Shanya", [
    ["8906199313551", "Gold Crown B"],
  ]],
  ["8906199313070", "Glitter Tiara with Satin Sash by Shanya", [
    ["8906199313568", "Gold Crown C"],
  ]],
  ["8906199310949", "Birthday Girl Sash & Headband Set by Shanya", [
    ["8906199313575", "Silver Bday Girl Band"],
    ["8906199313582", "Silver & Pink Sash"],
  ]],
  ["8906199313063", "Birthday Girl Glitter Sash & Tiara Crown by Shanya", [
    ["8906199313599", "Silver Crown"],
    ["8906199313605", "Sash"],
  ]],
];

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
  await writeFile("import-backup-ecom-sash-sets.json", JSON.stringify(store));

  const byEan = new Map();
  for (const p of store.products) if (p.channel === CHANNEL) byEan.set(p.ean, p);

  const rpt = { mastersCreated: 0, mastersUpdated: 0, barcodesAdded: 0, compProductsRemoved: 0, piecesMigrated: 0, skipped: [] };

  function ensureMaster(ean, name) {
    let p = byEan.get(ean);
    if (!p) {
      p = { ean, channel: CHANNEL, name, comboSizes: [], barcodes: [], reorderLevel: 0 };
      store.products.push(p);
      byEan.set(ean, p);
      rpt.mastersCreated++;
    } else {
      p.name = name;
      if (!Array.isArray(p.barcodes)) p.barcodes = [];
      rpt.mastersUpdated++;
    }
    return p;
  }

  // Migrate a component product's per-warehouse stock into the master (size 1 →
  // pieces map 1:1), then delete the component product + its stock rows.
  function migrateAndRemove(compEan, master) {
    let moved = 0;
    for (const s of store.stock) {
      if (s.ean !== compEan) continue;
      let row = store.stock.find((r) => r.warehouseId === s.warehouseId && r.ean === master.ean);
      if (!row) { row = { warehouseId: s.warehouseId, ean: master.ean, quantity: 0 }; store.stock.push(row); }
      row.quantity += s.quantity || 0;
      moved += s.quantity || 0;
    }
    store.stock = store.stock.filter((s) => s.ean !== compEan);
    store.products = store.products.filter((p) => !(p.channel === CHANNEL && p.ean === compEan));
    byEan.delete(compEan);
    rpt.piecesMigrated += moved;
    if (moved) console.log(`    migrated ${moved} pcs  ${compEan} → ${master.ean}`);
  }

  for (const [masterEan, masterName, comps] of GROUPS) {
    const master = ensureMaster(masterEan, masterName);
    for (const [compEan, compName] of comps) {
      if (compEan === masterEan) continue;
      // If the component still exists as its own product, fold it in.
      if (byEan.has(compEan)) migrateAndRemove(compEan, master);
      if (!master.barcodes.some((b) => b.ean === compEan)) {
        master.barcodes.push({ ean: compEan, size: 1, name: compName });
        rpt.barcodesAdded++;
      }
    }
  }

  // Sanity: every EAN owned exactly once.
  const owner = new Map();
  const clashes = [];
  for (const p of store.products) {
    if (p.channel !== CHANNEL) continue;
    const mark = (e, w) => { if (owner.has(e)) clashes.push(`${e}: ${owner.get(e)} & ${w}`); else owner.set(e, w); };
    mark(p.ean, `primary:${p.ean}`);
    for (const b of p.barcodes || []) mark(b.ean, `barcode-of:${p.ean}`);
  }

  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });

  console.log("✓ Sash sets setup done.");
  console.log(`  masters created:        ${rpt.mastersCreated}`);
  console.log(`  masters updated:        ${rpt.mastersUpdated}`);
  console.log(`  size-1 barcodes added:  ${rpt.barcodesAdded}`);
  console.log(`  component products removed: ${rpt.compProductsRemoved || (GROUPS.flatMap((g) => g[2]).length)}`);
  console.log(`  pieces migrated to masters: ${rpt.piecesMigrated}`);
  console.log(`  EAN clashes: ${clashes.length}`);
  for (const c of clashes) console.log(`      ! ${c}`);

  // Show the result.
  for (const [masterEan] of GROUPS) {
    const p = byEan.get(masterEan);
    const packs = (p.barcodes || []).map((b) => `${b.name} ${b.ean} (x${b.size})`).join(", ");
    console.log(`  ${masterEan}  "${p.name}"  → [${packs}]`);
  }
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
