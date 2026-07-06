// Import the Orient B2B catalog (ASIN · pack size · SKU) directly into MongoDB
// under the "Orient" brand, in the B2B channel. Writes to the store doc directly
// (no app login needed).  Run:  node scripts/import-orient-b2b.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const BRAND = "Orient";
const CHANNEL = "b2b";

// [ASIN, packSize, SKU]  — transcribed from orient.pdf
const ROWS = [
  // p1
  ["B08FY9WCP9", 1, "LED10WBL-65KB22MS"],
  ["B09X75GQ5G", 8, "LED10WBL-65KB22MS"],
  ["B09X769JJP", 2, "LED10WBL-65KB22MS"],
  ["B09X76NKMP", 4, "LED10WBL-65KB22MS"],
  ["B09Z6P6LWF", 1, "LED26WBL-65KB22D"],
  ["B09Z6PCRTY", 2, "LED30WBL-65KB22D"],
  ["B09Z6PGP9D", 2, "LED23WBL-65KB22D"],
  ["B09Z6Q1MGW", 2, "LED40WBL-65KB22DM"],
  ["B09Z6QFWWJ", 2, "LED50WBL-65KB22D"],
  ["B0CH68DKPK", 1, "LED12WPL-SUR60KRDT"],
  ["B0CPC2FJVX", 2, "LED12WPL-SUR60KRDT"],
  ["B0CV3YTPYC", 1, "LED24WPL-SUR30KRDT"],
  ["B0CV3Z9JVG", 1, "LED24WPL-SUR60KRDT"],
  ["B0CV3Z9JVJ", 1, "LED18WPL-SUR30KRDT"],
  ["B0CWNS9Z5Y", 1, "LED18WPL-SUR60KRDT"],
  ["B0D4BXJ4GX", 20, "LED12WPL-SUR60KRDT"],
  ["B0D4BYTNHR", 4, "LED12WPL-SUR60KRDT"],
  ["B0D4C3GCW5", 6, "LED12WPL-SUR60KRDT"],
  ["B0D4C3HLQY", 10, "LED12WPL-SUR60KRDT"],
  ["B0D4TWXSHP", 2, "LED12WPL-SUR30KRDT"],
  ["B0D4TZ92VH", 4, "LED12WPL-SUR30KRDT"],
  ["B0D4V37C55", 1, "LED12WPL-SUR30KRDT"],
  ["B0D4YZWJW8", 1, "LED06WPL-SUR30KRDT"],
  ["B0D4Z2STRX", 1, "LED06WPL-SUR60KRDT"],
  ["B0D4Z2VHBS", 1, "LED36WBT-GRDS65K20"],
  ["B0D8L67DHF", 1, "LED30WBL-65KB22D"],
  ["B0D8L81ZMJ", 1, "LED50WBL-65KB22D"],
  ["B0D8L8BNWG", 1, "LED40WBL-65KB22D"],
  ["B0D8L9DMQG", 1, "LED23WBL-65KB22D"],
  ["B0F677PLHZ", 4, "LED23WBL-65KB22D"],
  // p2
  ["B0F6BWW9N8", 10, "LED23WBL-65KB22D"],
  ["B0F6BXJN9S", 10, "LED26WBL-65KB22M"],
  ["B0F6BZWF5Y", 4, "LED26WBL-65KB22D"],
  ["B0F941KIYF", 3, "LED06WPL-SUR60KRDT"],
  ["B0F941NQ3V", 6, "LED06WPL-SUR60KRDT"],
  ["B0F9942XZT", 12, "LED06WPL-SUR60KRDT"],
  ["B0F9DRPSN2", 12, "LED06WPL-SUR30KRDT"],
  ["B0F9DTXQ2M", 6, "LED06WPL-SUR30KRDT"],
  ["B0F9DXT1M3", 3, "LED06WPL-SUR30KRDT"],
  ["B0F9FG1182", 4, "LED18WPL-SUR30KRDT"],
  ["B0F9FGM62J", 4, "LED18WPL-SUR60KRDT"],
  ["B0F9FGT2ZW", 2, "LED18WPL-SUR60KRDT"],
  ["B0F9FJ94N2", 2, "LED18WPL-SUR30KRDT"],
  ["B0FJRWCDPS", 1, "LED50WBT-GRDS40KT"],
  ["B0FJRXGGBF", 1, "LED60WBT-GRDS40KT"],
  ["B0FT7MFP3T", 1, "LED12WDL-COB40KRDE"],
  ["B0FT7MLXIW", 1, "LED06WDL-COB40KRDE"],
  ["B0FT7MR3H9", 1, "LED12WDL-COB60KNRG"],
  ["B0FT7N148P", 1, "LED06WDL-COB30KNBL"],
  ["B0FT7NP1VX", 1, "LED09WDL-COB30KRDE"],
  ["B0FT7PKP1H", 1, "LED09WDL-COB40KRDE"],
  ["B0FT7PMML7", 1, "LED09WDL-COB60KRDE"],
  ["B0FT7PS74V", 1, "LED06WDL-COB40KNRG"],
  ["B0FT7Q4XJQ", 1, "LED06WDL-COB60KNRG"],
  ["B0FT7QL1V3", 1, "LED12WDL-COB30KRDE"],
  ["B0FT7QQ3W4", 1, "LED06WDL-COB40KNBL"],
  ["B0FT7QRPVT", 1, "LED06WDL-COB30KRDE"],
  ["B0FT7QTLKW", 1, "LED12WDL-COB60KRDE"],
  ["B0FT7R3C4V", 1, "LED12WDL-COB40KNBL"],
  ["B0FT7R9ZTV", 1, "LED06WDL-COB60KNBL"],
  ["B0FT7RJ7XL", 1, "LED12WDL-COB30KNBL"],
  // p3
  ["B0FT7RZNQB", 1, "LED06WDL-COB60KRDE"],
  ["B0FT7SSD8N", 1, "LED12WDL-COB40KNRG"],
  ["B0FT7SY737", 1, "LED06WDL-COB30KNRG"],
  ["B0FT7SZJR9", 1, "LED12WDL-COB30KNRG"],
  ["B0FT7T8S96", 1, "LED12WDL-COB60KNBL"],
  ["B0FV2LBCKJ", 1, "LED12WDL-COB40KB"],
  ["B0FV2NQPNN", 1, "LED18WDL-COB30KRPT"],
  ["B0FV2P7LZ7", 1, "LED05WHD-WL30K1SR"],
  ["B0FV2QF5SW", 1, "LED07WDL-COB65KB"],
  ["B0FV2QRQMX", 1, "LED18WDL-COB60KRPT"],
  ["B0FV2QYDRF", 1, "LED06WDL-COB30KRPT"],
  ["B0FV2R77PK", 1, "LED10WHD-WL65K2SR"],
  ["B0FV2RMJGP", 1, "LED10WHD-WL40K2SR"],
  ["B0FV2RN9BL", 1, "LED10WHD-WL30K2SR"],
  ["B0FV2RNRJV", 1, "LED03WHD-FOOT30K"],
  ["B0FV2RQRH4", 1, "LED12WDL-COB30KRG"],
  ["B0FV2RVI92", 1, "LED12WDL-COB65KRG"],
  ["B0FV2RXCBV", 1, "LED07WDL-COB65KRG"],
  ["B0FV2RXNF2", 1, "LED05WHD-WL40K1SR"],
  ["B0FV2RZ25L", 1, "LED18WDL-COB40KRPT"],
  ["B0FV2SCPPB", 1, "LED03WHD-FOOT65K"],
  ["B0FV2SF5D1", 1, "LED12WDL-COB60KRPT"],
  ["B0FV2SG6D8", 1, "LED05WHD-WL65K1SR"],
  ["B0FV2SKLCS", 1, "LED12WDL-COB30KRPT"],
  ["B0FV2SMHLP", 1, "LED06WDL-COB40KRPT"],
  ["B0FV2SPLC9", 1, "LED12WDL-COB40KRPT"],
  ["B0FV2SQDN3", 1, "LED07WDL-COB40KB"],
  ["B0FV2STFQC", 1, "LED12WDL-COB65KB"],
  ["B0FV2T19TK", 1, "LED07WDL-COB30KRG"],
  ["B0FV2T2VDH", 1, "LED12WDL-COB40KRG"],
  ["B0FV2T4M62", 1, "LED06WDL-COB60KRPT"],
  // p4
  ["B0FV2TNPRS", 1, "LED12WDL-COB30KB"],
  ["B0FV2TQ4PR", 1, "LED07WDL-COB30KB"],
  ["B0FV2VGNBK", 1, "LED03WHD-FOOT40K"],
  ["B0FV2ZG157", 1, "LED07WDL-COB40KRG"],
  ["B0GCF4Z26M", 1, "LED40WSL-65KIP65RZ"],
  ["B0GCFXNF1G", 1, "LED50WSL-65KIP65RZ"],
  ["B0GGBPVR2J", 1, "LED04WHD-WL30K4SB"],
  ["B0GGBSD3B2", 1, "LED24WBT-GRDS65KPRO"],
  ["B0GGBTMTX4", 1, "LED12WBH-65KI"],
  ["B0GGBTSP2S", 1, "LED06WHD-WL30K6S"],
  ["B0GGBWPGNV", 1, "LED12WBH-30KI"],
  ["B0GGBWRRV8", 1, "LED20WBH-30KI"],
  ["B0GGBX3Y4S", 1, "LED20WBH-65KI"],
  ["B0GGBX9TWX", 1, "LED04WHD-WL30K4S"],
  ["B0GGBXG9WT", 1, "LED02WHD-WL30K2S"],
];

function envVal(text, key) {
  const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "mi"));
  return m ? m[1].trim() : undefined;
}

async function main() {
  const env = await readFile(".env.local", "utf8");
  const uri = envVal(env, "MONGODB_URI");
  const dbName = envVal(env, "MONGODB_DB") || "inventory";
  if (!uri) throw new Error("MONGODB_URI not found in .env.local");

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const col = client.db(dbName).collection("app");
  const doc = await col.findOne({ _id: "store" });
  if (!doc) throw new Error("store doc not found");
  const store = doc.data;

  await writeFile("import-backup-orient.json", JSON.stringify(store));

  const byEan = new Map(); // sku -> product (this channel)
  for (const p of store.products) {
    if (p.channel === CHANNEL) byEan.set(p.ean, p);
  }
  // Primary EANs owned by OTHER products in this channel (avoid barcode clash).
  const otherPrimary = new Set(
    store.products.filter((p) => p.channel === CHANNEL).map((p) => p.ean)
  );

  let created = 0, packsAdded = 0, skipped = 0;
  for (const [asin, size, sku] of ROWS) {
    let product = byEan.get(sku);
    if (!product) {
      product = {
        ean: sku, channel: CHANNEL, name: `${BRAND} ${sku}`, brand: BRAND,
        comboSizes: [], barcodes: [], reorderLevel: 0,
      };
      store.products.push(product);
      byEan.set(sku, product);
      otherPrimary.add(sku);
      created++;
    } else {
      product.brand = BRAND;
      if (!Array.isArray(product.barcodes)) product.barcodes = [];
    }
    if (asin === sku || (otherPrimary.has(asin) && asin !== sku)) { skipped++; continue; }
    if (product.barcodes.some((b) => b.ean === asin)) { skipped++; continue; }
    product.barcodes.push({ ean: asin, size, name: size === 1 ? sku : `${sku}_${size}` });
    packsAdded++;
  }

  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });
  const distinct = new Set(ROWS.map((r) => r[2])).size;
  console.log(`✓ Orient import done. rows: ${ROWS.length} | distinct SKU: ${distinct}`);
  console.log(`  products created: ${created} | pack barcodes added: ${packsAdded} | skipped: ${skipped}`);
  console.log(`  total products now: ${store.products.length}`);
  await client.close();
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
