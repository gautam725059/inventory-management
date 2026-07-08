// Name the remaining Orient B2B masters by DECODING their structured SKU
// (watt + type + colour-temp + variant). Only touches products still showing the
// raw placeholder name ("Orient <SKU>"); the 6 pilot names are left untouched.
// Where a COB/wall-light trailing trim code can't be mapped to a real finish, the
// raw code is kept verbatim in parentheses so every SKU stays unique and nothing
// is misrepresented. Backs up the whole store first.
//   node scripts/apply-orient-desc.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const CHANNEL = "b2b";

const COLOR = { "30": "3000K Warm White", "40": "4000K Natural White", "60": "6000K Cool White", "65": "6500K Cool White" };

function decode(sku) {
  const m = sku.match(/^LED(\d+)W([A-Z]{2})-(.*)$/);
  if (!m) return null;
  const w = parseInt(m[1], 10);
  const type = m[2];
  const rest = m[3];
  const cm = rest.match(/(\d{2})K/);
  const ck = cm ? cm[1] : null;
  const color = ck ? (COLOR[ck] || `${ck}00K`) : "";
  const trim = cm ? rest.slice(cm.index + cm[0].length) : rest;

  switch (type) {
    case "BL": // Eternal Shine bulb; trim = cap token e.g. B22D
      return `Orient Eternal Shine LED Bulb ${w}W ${trim}, ${color}`.trim();
    case "BH": // bulb (I = series marker, dropped)
      return `Orient LED Bulb ${w}W, ${color}`;
    case "PL": // SUR = surface, RDT = round
      return `Orient ${w}W Round Surface LED Panel Light, ${color}`;
    case "DL": // COB downlight; trim = finish/trim variant (kept raw)
      return `Orient ${w}W COB LED Downlight, ${color}${trim ? ` (${trim})` : ""}`;
    case "BT": // GRDS batten; unique by wattage, trailing code dropped
      return `Orient ${w}W LED Batten, ${color}`;
    case "SL": // IP65 outdoor floodlight
      return `Orient ${w}W IP65 LED Floodlight, ${color}`;
    case "HD": // decorative: WL = wall light, FOOT = foot/step light
      if (/^FOOT/.test(rest)) return `Orient ${w}W LED Foot Light, ${color}`;
      if (/^WL/.test(rest)) return `Orient ${w}W LED Wall Light, ${color}${trim ? ` (${trim})` : ""}`;
      return `Orient ${w}W LED Light, ${color}`;
    default:
      return null;
  }
}

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
  await writeFile("import-backup-orient-desc-full.json", JSON.stringify(store));

  const orient = store.products.filter(
    (p) => p.channel === CHANNEL && /orient/i.test(p.brand || "")
  );

  let updated = 0;
  const failed = [];
  for (const p of orient) {
    // Only rename raw placeholders ("Orient <SKU>"); leave pilot names alone.
    if (p.name !== `Orient ${p.ean}`) continue;
    const name = decode(p.ean);
    if (!name) { failed.push(p.ean); continue; }
    console.log(`  ${p.ean}\n     -> ${name}`);
    p.name = name;
    updated++;
  }

  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });
  const left = orient.filter((p) => p.name === `Orient ${p.ean}`).map((p) => p.ean);
  console.log(`\n✓ Orient descriptions applied.`);
  console.log(`  names updated: ${updated}`);
  console.log(`  could not decode: ${failed.length ? failed.join(", ") : "none"}`);
  console.log(`  still placeholder: ${left.length ? left.join(", ") : "none"}`);
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
