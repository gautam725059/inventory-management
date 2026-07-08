// Name the Wipro B2B orphans (products auto-created by scripts/set-wipro-haryana.mjs
// from wpro-inventory.pdf, which carries no descriptions -- hence they were never in
// wipro-dis.pdf and stayed as "Wipro <SKU>").
//
// Every name below is sourced from a real retailer/catalogue listing that carries the
// EXACT SKU string. Nothing here is pattern-guessed. SKUs whose exact string could not
// be tied to a product are listed in UNRESOLVED and deliberately left untouched.
//
// Keyed by EXACT DB SKU; only the NAME field is written; only raw placeholders touched.
// Backs up the whole store first.   node scripts/apply-wipro-orphan-desc.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const CHANNEL = "b2b";

// SKU (exact DB primary code) -> master name.
const NAMES = {
  // Verified present in wipro-dis.pdf (p.11): bare pack-of-1 sibling of N30101-1.
  "N30101": "Wipro Garnet 30W LED High Wattage Bulb, Cool Day White (6500K), B22 Base",

  // Amazon.in dp/B095SWYF6M + Croma p/260392 -- both carry "NS9400" in the title.
  "NS9400": "Wipro Garnet 9W B22 Wi-Fi Smart LED Bulb, 16 Million Colours, Music Sync (RGB + CCT)",

  // Moglix msnv5ooggp0v56 + Croma p/263970 -- "…Wi-Fi Smart LED Bulb with Music Sync, NS1220".
  "NS1220": "Wipro Garnet 12.5W B22 Wi-Fi Smart LED Bulb, 16 Million Colours, Music Sync (RGB + CCT)",

  // TataCliq + Moglix + Amazon (D532065_2) + racknsell -- "Garnet 20W … 4 Ft | 6500K".
  "D532065": "Wipro Garnet 20W LED Batten, 4 Ft, Cool Day White (6500K)",

  // thedesignbridge.in Model Number D532200 -- "Garnet 22W Colour Changing Batten".
  // "3-in-1" / "CCT" are retailer embellishments, not Wipro's wording.
  "D532200": "Wipro Garnet 22W Colour Changing LED Batten (Warm / Neutral / Cool White)",

  // Moglix msnz526xq67w9x spec block: Model D350327, 3W, 2700K, Round Mini Downlight.
  // NOTE: a mini downlight, NOT a Slim COB -- do not pattern-match off D320327.
  "D350327": "Wipro Garnet 3W Round Mini LED Downlight, Warm White (2700K)",

  // IndustryBuying (Model Number: CL0005) + Flipkart "wipro cl0005 emerald led rechargeable".
  // Wattage is contested across retailers (3W vs 5W), so it is omitted from the name.
  "CL0005": "Wipro Emerald LED Rechargeable Torch",
};

// Exact SKU string could not be tied to any Wipro product on any listing. Each is one
// character off a SKU that DOES exist, so these are likely upstream transcription errors
// in wpro-inventory.pdf. Left as "Wipro <SKU>" until the boss confirms.
//   NE9011  (cf. NE9001 -- 9W emergency bulb)
//   E10016  (cf. E10015 -- Safari emergency lantern)
//   E10017
//   D54265  (cf. D542265 / D542565)
//   CLL0011 (cf. CL0011 -- Radiant dual light torch)
//   DSC2150 (cf. DSE2150 -- Next Smart Extension)
const UNRESOLVED = ["NE9011", "E10016", "E10017", "D54265", "CLL0011", "DSC2150"];

function envVal(t, k) { const m = t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`, "mi")); return m ? m[1].trim() : undefined; }

async function main() {
  const env = await readFile(".env.local", "utf8");
  const client = new MongoClient(envVal(env, "MONGODB_URI"), { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const col = client.db(envVal(env, "MONGODB_DB") || "inventory").collection("app");
  const store = (await col.findOne({ _id: "store" })).data;
  await writeFile("import-backup-wipro-orphan-desc-2.json", JSON.stringify(store));

  const byEan = new Map();
  for (const p of store.products) if (p.channel === CHANNEL) byEan.set(p.ean, p);

  let updated = 0;
  const skipped = [];
  for (const [sku, name] of Object.entries(NAMES)) {
    const p = byEan.get(sku);
    if (!p) { skipped.push(`${sku} (not in DB)`); continue; }
    if (p.name !== `Wipro ${sku}`) { skipped.push(`${sku} (already named: "${p.name}")`); continue; }
    p.name = name;
    updated++;
    console.log(`  ${sku}\n     -> ${name}`);
  }

  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });

  const left = store.products
    .filter((p) => p.channel === CHANNEL && /wipro/i.test(p.brand || "") && p.name === `Wipro ${p.ean}`)
    .map((p) => p.ean);

  console.log(`\n✓ names updated: ${updated}`);
  if (skipped.length) console.log(`  skipped: ${skipped.join(" | ")}`);
  console.log(`  still placeholder (${left.length}): ${left.join(", ") || "none"}`);
  console.log(`  expected unresolved (${UNRESOLVED.length}): ${UNRESOLVED.join(", ")}`);
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
