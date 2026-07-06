// READ-ONLY: print a master product and its pack barcodes so we can eyeball the
// consolidation. Run:  node scripts/verify-ecom-masters.mjs
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const MASTERS = [
  ["8906199313155", "J Hook"],
  ["8906199313193", "Frame Hook"],
  ["8906199311465", "Frame Hook Long"],
  ["8906199313209", "Nut Hook"],
  ["8906199313421", "S Hook"],
  ["8906199313407", "Crystal Hook"],
  ["8906199313414", "U Transparent Hook"],
  ["8906199313490", "Ice Cube Tray Hexagonal"],
  ["8906199313254", "6PC Transparent Hook"],
  ["8906199313520", "Name Tag Key Chain"],
  ["8906199313612", "Gajra Scrunchie White"],
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

  const byEan = new Map();
  for (const p of store.products) if (p.channel === "ecom") byEan.set(p.ean, p);

  for (const [ean, label] of MASTERS) {
    const p = byEan.get(ean);
    if (!p) { console.log(`\n${label} (${ean}) — MASTER NOT FOUND`); continue; }
    const packs = [...(p.barcodes || [])].sort((a, b) => a.size - b.size);
    console.log(`\n${label}  [master ${p.ean}]  "${p.name}"`);
    if (packs.length === 0) console.log("   (no pack barcodes)");
    for (const b of packs) console.log(`   Pack of ${b.size}  ·  ${b.ean}`);
  }

  // Sanity: any EAN owned by more than one product (primary or barcode)?
  const owner = new Map();
  const clashes = [];
  for (const p of store.products) {
    if (p.channel !== "ecom") continue;
    const mark = (e, where) => {
      if (owner.has(e)) clashes.push(`${e}: ${owner.get(e)} & ${where}`);
      else owner.set(e, where);
    };
    mark(p.ean, `primary:${p.ean}`);
    for (const b of p.barcodes || []) mark(b.ean, `barcode-of:${p.ean}`);
  }
  console.log(`\nEAN clashes: ${clashes.length}`);
  for (const c of clashes) console.log(`   ! ${c}`);
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
