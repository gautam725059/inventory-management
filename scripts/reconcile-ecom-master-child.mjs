// Definitive reconcile of the e-com master/child structure against the sheet.
//   • Numeric P1 (or smallest-pack) rows are the MASTERS — they hold the stock.
//   • Every bigger pack becomes a barcode under its master (size = P-number).
//   • Removes the leftover zero-stock "auto-<slug>" duplicate masters and any
//     zero-stock standalone product that should just be a pack barcode.
//   • NEVER deletes anything carrying stock, and never deletes a master.
// Idempotent — safe to re-run. Backs up first.
//   node scripts/reconcile-ecom-master-child.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
import { ROWS, extractPack, baseKey } from "./import-ecom-master-child.mjs";

const CHANNEL = "ecom";

function envVal(text, key) {
  const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "mi"));
  return m ? m[1].trim() : undefined;
}

// ---- Derive families / masters / child assignments from the sheet ----------
const families = new Map();
for (const [ean, code, name] of ROWS) {
  const pack = extractPack(code);
  if (!pack) continue; // standalone (no pack token) → left as its own product
  const key = baseKey(pack.base) || String(ean);
  if (!families.has(key)) families.set(key, []);
  families.get(key).push({ ean: String(ean), code, name, size: pack.size });
}

const masterEanSet = new Set();
const masterName = new Map();
const masterMembers = [];
for (const [, members] of families) {
  members.sort((a, b) => a.size - b.size);
  const master = members[0];
  masterEanSet.add(master.ean);
  masterName.set(master.ean, master.name);
  masterMembers.push({ masterEan: master.ean, masterSize: master.size, members });
}

// childEan -> {masterEan, size, code}  (first occurrence wins on duplicates)
const childAssign = new Map();
for (const { masterEan, masterSize, members } of masterMembers) {
  for (let i = 1; i < members.length; i++) {
    const c = members[i];
    if (c.size === masterSize) continue; // same-size extra → its own product
    if (masterEanSet.has(c.ean)) continue; // this EAN is itself a master
    if (c.ean === masterEan) continue;
    if (childAssign.has(c.ean)) continue; // duplicate EAN in the PDF — first wins
    childAssign.set(c.ean, { masterEan, size: c.size, code: c.code });
  }
}

async function main() {
  const env = await readFile(".env.local", "utf8");
  const uri = envVal(env, "MONGODB_URI");
  const dbName = envVal(env, "MONGODB_DB") || "inventory";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const col = client.db(dbName).collection("app");
  const doc = await col.findOne({ _id: "store" });
  const store = doc.data;
  await writeFile("import-backup-ecom-reconcile.json", JSON.stringify(store));

  const stockByEan = new Map();
  for (const s of store.stock) stockByEan.set(s.ean, (stockByEan.get(s.ean) || 0) + (s.quantity || 0));
  const stockOf = (ean) => stockByEan.get(ean) || 0;

  // ---- Deletions -----------------------------------------------------------
  const del = new Set();
  const keptWithStock = [];
  for (const p of store.products) {
    if (p.channel !== CHANNEL) continue;
    const q = stockOf(p.ean);
    const isAuto = !/^\d+$/.test(p.ean);
    const shouldBeChild = childAssign.has(p.ean) && !masterEanSet.has(p.ean);
    if (q > 0) {
      if (isAuto || shouldBeChild) keptWithStock.push(`${p.ean} (${p.name}) qty=${q}`);
      continue; // never delete anything with stock
    }
    if (isAuto) del.add(p.ean); // zero-stock leftover duplicate master
    else if (shouldBeChild) del.add(p.ean); // zero-stock standalone that's really a pack
  }
  const before = store.products.length;
  store.products = store.products.filter((p) => !(p.channel === CHANNEL && del.has(p.ean)));
  store.stock = store.stock.filter((s) => !del.has(s.ean));
  const deleted = before - store.products.length;

  // ---- Rebuild masters' barcodes ------------------------------------------
  const byEan = new Map();
  for (const p of store.products) if (p.channel === CHANNEL) byEan.set(p.ean, p);

  let mastersMissing = 0, barcodesSet = 0;
  for (const masterEan of masterEanSet) {
    const p = byEan.get(masterEan);
    if (!p) { mastersMissing++; continue; }
    if (masterName.has(masterEan)) p.name = masterName.get(masterEan);
    if (!Array.isArray(p.barcodes)) p.barcodes = [];
    const want = new Map();
    // keep any existing barcode that is still valid (not a master, not the primary)
    for (const b of p.barcodes) {
      if (b.ean === p.ean || masterEanSet.has(b.ean)) continue;
      want.set(b.ean, { ean: b.ean, size: b.size, name: b.name });
    }
    // apply the sheet's children for this master (authoritative sizes)
    for (const [childEan, ca] of childAssign) {
      if (ca.masterEan !== masterEan) continue;
      want.set(childEan, { ean: childEan, size: ca.size, name: ca.code });
    }
    p.barcodes = [...want.values()];
    barcodesSet += p.barcodes.length;
  }

  // ---- Global sweep: a pack EAN may live ONLY under its assigned master ----
  // Strips stale duplicates left on other products (PDF-duplicate EANs, old
  // stray masters, etc.) so every EAN is owned exactly once.
  let stripped = 0;
  for (const p of store.products) {
    if (p.channel !== CHANNEL || !Array.isArray(p.barcodes)) continue;
    const seen = new Set();
    const kept = [];
    for (const b of p.barcodes) {
      if (seen.has(b.ean)) { stripped++; continue; }
      if (b.ean === p.ean) { stripped++; continue; }
      if (masterEanSet.has(b.ean)) { stripped++; continue; } // a master isn't a pack
      if (childAssign.has(b.ean) && childAssign.get(b.ean).masterEan !== p.ean) {
        stripped++; continue; // belongs under a different master
      }
      seen.add(b.ean);
      kept.push(b);
    }
    p.barcodes = kept;
  }

  // ---- Sanity: no EAN owned twice -----------------------------------------
  const owner = new Map();
  const clashes = [];
  for (const p of store.products) {
    if (p.channel !== CHANNEL) continue;
    const mark = (e, w) => { if (owner.has(e)) clashes.push(`${e}: ${owner.get(e)} & ${w}`); else owner.set(e, w); };
    mark(p.ean, `primary:${p.ean}`);
    for (const b of p.barcodes || []) mark(b.ean, `barcode-of:${p.ean}`);
  }

  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });

  console.log("✓ Reconcile done.");
  console.log(`  families:                 ${families.size}`);
  console.log(`  masters (in sheet):       ${masterEanSet.size}`);
  console.log(`  child pack assignments:   ${childAssign.size}`);
  console.log(`  products deleted (0 stock): ${deleted}`);
  console.log(`  masters missing in DB:    ${mastersMissing}`);
  console.log(`  total pack barcodes set:  ${barcodesSet}`);
  console.log(`  stale barcodes stripped:  ${stripped}`);
  console.log(`  kept despite being flagged (had stock): ${keptWithStock.length}`);
  for (const x of keptWithStock) console.log(`      • ${x}`);
  console.log(`  EAN clashes remaining:    ${clashes.length}`);
  for (const c of clashes) console.log(`      ! ${c}`);
  console.log(`  total e-com products now: ${store.products.filter((p) => p.channel === CHANNEL).length}`);
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
