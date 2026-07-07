// PILOT: set proper descriptions (names) on a few clearly-readable Orient B2B
// masters, to confirm the approach before doing all 214. Names only; backs up.
//   node scripts/orient-desc-pilot.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const CHANNEL = "b2b";
// [ SKU (primary ean), master name ]
const NAMES = [
  ["LED10WBL-65KB22MS", "Orient Electric Motion Sensor Energy Saving Automatic On/Off 10W LED Bulb, 6500K"],
  ["LED26WBL-65KB22D", "Orient Electric Eternal Shine LED Bulb 26W, B22d Cap, 6500K"],
  ["LED30WBL-65KB22D", "Orient Electric Eternal Shine LED Bulb 30W, B22d Cap, 6500K"],
  ["LED23WBL-65KB22D", "Orient Electric Eternal Shine LED Bulb 23W, B22d Cap, 6500K"],
  ["LED40WBL-65KB22DM", "Orient Electric Eternal Shine LED Bulb 40W, B22d Cap, 6500K"],
  ["LED50WBL-65KB22D", "Orient Electric Eternal Shine LED Bulb 50W, B22d Cap, 6500K"],
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
  await writeFile("import-backup-orient-desc.json", JSON.stringify(store));

  const byEan = new Map();
  for (const p of store.products) if (p.channel === CHANNEL) byEan.set(p.ean, p);

  let updated = 0;
  for (const [sku, name] of NAMES) {
    const p = byEan.get(sku);
    if (!p) { console.log(`  MISSING: ${sku}`); continue; }
    const old = p.name;
    p.name = name;
    updated++;
    console.log(`  ${sku}\n     old: ${old}\n     new: ${name}`);
  }
  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });
  console.log(`\n✓ Pilot done. names updated: ${updated}`);
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
