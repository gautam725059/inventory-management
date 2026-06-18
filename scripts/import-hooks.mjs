// One-time import of the Shanya catalog (from ean.pdf) into MongoDB.
// Masters become products; packs become pack barcodes (ean + size + name).
// Run:  node scripts/import-hooks.mjs

import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

// ---- catalog data (transcribed from ean.pdf) ------------------------------
// { name, ean (master, optional), packs:[{ name(code), ean, size, listing }] }
const CATALOG = [
  // ---- Hooks (master + packs) ----
  { name: "J Hook (Flower J Hook)", ean: "8906199313155", packs: [
    { code: "J Hook P10", ean: "8906199310000", size: 10, listing: "Shanya Adhesive Wall Hooks Transparent (Stainless Steel, Transparent)" },
    { code: "J Hook P15", ean: "8906199310017", size: 15, listing: "Shanya Adhesive Wall Hooks (Stainless Steel, Transparent)" },
    { code: "J Hook P20", ean: "8906199310024", size: 20, listing: "Shanya Heavy-Duty Adhesive Wall Hooks" },
  ]},
  { name: "Big J Hook Silver", ean: "8906199313162", packs: [
    { code: "Big J Hook Silver P10", ean: "8906199311212", size: 10, listing: "Shanya Transparent Self-Adhesive Wall Hooks" },
  ]},
  { name: "Big J Hook Golden", ean: "8906199313186", packs: [
    { code: "Big J Hook Golden P10", ean: "8906199311205", size: 10, listing: "Shanya Self Adhesive Wall Hooks" },
  ]},
  { name: "Frame Hook", ean: "8906199313193", packs: [
    { code: "Frame Hook P10", ean: "8906199310079", size: 10, listing: "Shanya Self Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)" },
    { code: "Frame Hook P15", ean: "8906199310321", size: 15, listing: "Shanya Self Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)" },
    { code: "Frame Hook P20", ean: "8906199310338", size: 20, listing: "Shanya Self Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)" },
    { code: "Frame Hook Long P10", ean: "8906199311465", size: 10, listing: "Shanya Self Adhesive Wall Hooks (PVC, Transparent)" },
    // NOTE: Frame Hook Long P15/P20 in the sheet reuse the same EANs as P15/P20 (dup) — skipped by dedupe.
  ]},
  { name: "Nut Hook", ean: "8906199313216", packs: [
    { code: "Nut Hook P10", ean: "8906199310123", size: 10, listing: "Shanya Self-Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)" },
    { code: "Nut Hook P15", ean: "8906199310307", size: 15, listing: "Shanya Self-Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)" },
    { code: "Nut Hook P20", ean: "8906199310314", size: 20, listing: "Shanya Self-Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)" },
  ]},
  { name: "369 Rotating Hook", ean: "8906199313223", packs: [
    { code: "369 Rotating Hook P5", ean: "8906199311717", size: 5, listing: "Shanya Rotating Ceiling / Wall Hooks (Plastic, Black)" },
  ]},
  { name: "Star Hook", ean: "8906199313230", packs: [
    { code: "Star Hook P5", ean: "8906199312387", size: 5, listing: "Shanya Star Self-Adhesive Wall Hooks (Acrylic, Transparent)" },
  ]},
  { name: "Shell Hook", ean: "8906199313247", packs: [
    { code: "Shell Hook P5", ean: "8906199312394", size: 5, listing: "Shanya Shell Design Self-Adhesive Wall Hooks (Acrylic, Transparent)" },
  ]},
  { name: "6PC Transparent Hook", ean: "8906199313254", packs: [
    { code: "6PC Transparent Hook P2", ean: "8906199312592", size: 2, listing: "Shanya Transparent Self-Adhesive Wall Hooks" },
  ]},
  { name: "6PC Silver Hook", ean: "", packs: [
    { code: "6PC Silver Hook P2", ean: "8906199312585", size: 2, listing: "Shanya Transparent Self-Adhesive Wall Hooks" },
  ]},
  { name: "6PC Green Hook", ean: "", packs: [
    { code: "6PC Green Hook P2", ean: "8906199312578", size: 2, listing: "Shanya Self-Adhesive Wall Hooks" },
  ]},
  { name: "Matte Black U Hook", ean: "", packs: [
    { code: "Matte Black U Hook P5", ean: "8906199312899", size: 5 },
  ]},
  { name: "Matte Silver U Hook", ean: "", packs: [
    { code: "Matte Silver U Hook P5", ean: "8906199312103", size: 5 },
  ]},
  { name: "Matte Silver Hook", ean: "", packs: [
    { code: "Matte Silver Hook P2", ean: "8906199312257", size: 2 },
    { code: "Matte Silver Hook P4", ean: "21633907", size: 4 },
  ]},
  { name: "Matte Black Hook", ean: "", packs: [
    { code: "Matte Black Hook P2", ean: "8906199312240", size: 2 },
    { code: "Matte Black Hook P4", ean: "21633884", size: 4 },
  ]},
  { name: "Crystal Hook", ean: "", packs: [
    { code: "Crystal Hook P10", ean: "8906199310727", size: 10 },
    { code: "Crystal Hook P15", ean: "8906199310758", size: 15 },
    { code: "Crystal Hook P20", ean: "8906199310765", size: 20 },
  ]},
  { name: "U Transparent Hook", ean: "", packs: [
    { code: "U Transparent Hook P10", ean: "8906199310611", size: 10 },
    { code: "U Transparent Hook P15", ean: "8906199310734", size: 15 },
    { code: "U Transparent Hook P20", ean: "8906199310741", size: 20 },
  ]},
  { name: "S Hook", ean: "", packs: [ // sheet labelled this "U Transparent Hook" but packs are S Hook
    { code: "S Hook P10", ean: "8906199311502", size: 10 },
    { code: "S Hook P15", ean: "8906199311519", size: 15 },
    { code: "S Hook P20", ean: "8906199311526", size: 20 },
  ]},
  { name: "Cloth Rope", ean: "", packs: [
    { code: "Cloth Rope P2", ean: "8906199310093", size: 2, listing: "Shanya Nylon Cloth Rope with Clips (Multicolour)" },
  ]},
  { name: "Bathroom Shelf Black & White", ean: "", packs: [
    { code: "Bathroom Shelf Black & White P1", ean: "8906199311694", size: 1, listing: "Shanya Adhesive Bathroom Shelf (Plastic, White)" },
    { code: "Bathroom Shelf Black & White P2", ean: "8906199311670", size: 2, listing: "Shanya Wall Mounted Bathroom Shelf (Plastic, white)" },
  ]},
  { name: "Bathroom Shelf White", ean: "", packs: [
    { code: "Bathroom Shelf White P2", ean: "8906199311663", size: 2, listing: "Shanya Self Adhesive Bathroom Shelf (Plastic, White)" },
  ]},

  // ---- Standalone products (own EAN, sold single) ----
  { name: "Bathroom Towel Rod Single", ean: "8906199311779", packs: [] },
  { name: "Bathroom Towel Rod Double", ean: "8906199311762", packs: [] },
  { name: "Knife Set - Black", ean: "8906199310604", packs: [] },
  { name: "Knife Set - Purple", ean: "8906199310659", packs: [] },
  { name: "Knife Set - Blue", ean: "8906199310628", packs: [] },
  { name: "Knife Set - Green", ean: "8906199310642", packs: [] },
  { name: "Knife Set - Red", ean: "8906199310635", packs: [] },

  // ---- Products with a single pack ----
  { name: "Plastic Oil Dispenser", ean: "", packs: [
    { code: "Plastic Oil Dispenser P2", ean: "8906199311755", size: 2, listing: "Shanya Plastic Oil Dispenser" },
  ]},
  { name: "Silicone Baking Mat", ean: "", packs: [
    { code: "Silicone Baking Mat P2", ean: "8906199310130", size: 2, listing: "Shanya Anti-Skid Baking Mat (Silicone)" },
  ]},
  { name: "Shoe Cleaning Wipes", ean: "", packs: [
    { code: "Shoe Cleaning Wipes P1", ean: "8906199310192", size: 1, listing: "Shanya Shoe Cleaning Wipes" },
    { code: "Shoe Cleaning Wipes P2", ean: "8906199310178", size: 2, listing: "Shanya Shoe Cleaning Wipes" },
  ]},
  { name: "Ice Cube Tray Hexagonal", ean: "", packs: [
    { code: "Ice Cube Tray Hexagonal P2", ean: "8906199310031", size: 2, listing: "Shanya Ice Tray (Silicone)" },
  ]},
  { name: "Ice Cube Tray Circle", ean: "", packs: [
    { code: "Ice Cube Tray Circle P2", ean: "8906199310055", size: 2, listing: "Shanya Ice Tray Set (Silicone)" },
  ]},

  // ---- Standalone (own EAN) ----
  { name: "Evil Eye Key Chain - Tree", ean: "8906199312936", packs: [] },
  { name: "Evil Eye Key Chain - Elephant", ean: "8906199312929", packs: [] },
  { name: "Evil Eye Key Chain - Dream Catcher", ean: "8906199312943", packs: [] },
  { name: "Evil Eye Key Chain - Peacock", ean: "8906199312950", packs: [] },
  { name: "Evil Eye Key Chain - Turtle", ean: "8906199312967", packs: [] },
  { name: "Evil Eye Key Chain - Owl", ean: "8906199312974", packs: [] },
  { name: "Guardian Bell - Bronze", ean: "8906199312875", packs: [] },
  { name: "Guardian Bell - Silver", ean: "8906199312868", packs: [] },
  { name: "Face Changing Key Chain", ean: "8906199311700", packs: [] },
  { name: "Butterfly Crown (Princess Tiara)", ean: "8906199312882", packs: [] },

  // ---- Welcome Baby ----
  { name: "Welcome Baby Boy - Foot (Decoration Kit)", ean: "8906199311854", packs: [] },
  { name: "Welcome Baby Girl - Foot (Decoration Kit)", ean: "8906199311830", packs: [] },
  { name: "Welcome Baby Boy - Baby (Foil Balloons Kit)", ean: "8906199310987", packs: [] },
  { name: "Welcome Baby Girl - Baby (Decoration Kit)", ean: "21633861", packs: [] },
  { name: "Welcome Baby Girl - Baby (Foil Balloon Kit)", ean: "8906199310970", packs: [] },
];

function slug(name) {
  return "auto-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function main() {
  const env = Object.fromEntries(
    (await readFile(".env.local", "utf8"))
      .split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)).filter(Boolean)
      .map((m) => [m[1], m[2]])
  );
  const client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  const col = client.db(env.MONGODB_DB || "inventory").collection("app");
  const doc = await col.findOne({ _id: "store" });
  const store = doc.data;

  // safety snapshot
  await writeFile("import-backup.json", JSON.stringify(store));

  let created = 0, updated = 0, packsAdded = 0, packsSkipped = 0;
  for (const item of CATALOG) {
    const ean = item.ean && item.ean.trim() ? item.ean.trim() : slug(item.name);
    let product = store.products.find((p) => p.ean === ean);
    if (!product) {
      product = { ean, name: item.name, comboSizes: [], barcodes: [], reorderLevel: 0 };
      store.products.push(product);
      created++;
    } else {
      product.name = item.name;
      updated++;
    }
    if (!Array.isArray(product.barcodes)) product.barcodes = [];
    const otherPrimary = new Set(store.products.filter((p) => p.ean !== ean).map((p) => p.ean));
    for (const pk of item.packs) {
      const e = String(pk.ean).trim();
      if (!e || e === ean || otherPrimary.has(e)) { packsSkipped++; continue; }
      if (product.barcodes.some((b) => b.ean === e)) { packsSkipped++; continue; }
      product.barcodes.push({ ean: e, size: pk.size, name: pk.listing || pk.code });
      packsAdded++;
    }
  }

  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });
  console.log(`✓ Import done.`);
  console.log(`  products created: ${created}, updated: ${updated}`);
  console.log(`  pack barcodes added: ${packsAdded}, skipped(dup/invalid): ${packsSkipped}`);
  console.log(`  total products now: ${store.products.length}`);
  await client.close();
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
