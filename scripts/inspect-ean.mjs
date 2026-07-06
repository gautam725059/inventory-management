// READ-ONLY: dump everything about one code — product, stock, receipts,
// dispatches, adjustments — across both channels.
//   node scripts/inspect-ean.mjs 8906199310604
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const CODE = (process.argv[2] || "").trim();

function envVal(text, key) {
  const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "mi"));
  return m ? m[1].trim() : undefined;
}

async function main() {
  if (!CODE) throw new Error("pass an EAN: node scripts/inspect-ean.mjs <ean>");
  const env = await readFile(".env.local", "utf8");
  const uri = envVal(env, "MONGODB_URI");
  const dbName = envVal(env, "MONGODB_DB") || "inventory";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const store = (await client.db(dbName).collection("app").findOne({ _id: "store" })).data;

  const whName = (id) => store.warehouses.find((w) => w.id === id)?.name + `(${id})` || id;

  // Products where CODE is the primary EAN or one of the pack barcodes.
  console.log(`=== products matching ${CODE} ===`);
  for (const p of store.products) {
    const isPrimary = p.ean === CODE;
    const asBarcode = (p.barcodes || []).find((b) => b.ean === CODE);
    if (isPrimary || asBarcode) {
      console.log(`  [${p.channel}] primary=${p.ean}  "${p.name}"  ${isPrimary ? "<-- PRIMARY" : `<-- as pack barcode (x${asBarcode.size})`}`);
      if ((p.barcodes || []).length) console.log(`       barcodes: ${p.barcodes.map((b) => `${b.ean}/x${b.size}`).join(", ")}`);
    }
  }

  console.log(`\n=== stock rows for ${CODE} ===`);
  let total = 0;
  for (const s of store.stock) if (s.ean === CODE) { console.log(`  ${whName(s.warehouseId)}  qty=${s.quantity}`); total += s.quantity || 0; }
  console.log(`  TOTAL stock on ${CODE}: ${total}`);

  console.log(`\n=== receipts (stock-in) with ean ${CODE} ===`);
  let rin = 0;
  for (const r of store.receipts) if (r.ean === CODE) { console.log(`  ${r.date || r.createdAt?.slice(0,10)}  ${whName(r.warehouseId)}  qty=${r.quantity}  vendor=${r.vendorName || "-"}  bill=${r.bill || "-"}`); rin += r.quantity || 0; }
  console.log(`  total received on ${CODE}: ${rin}`);

  console.log(`\n=== dispatches (stock-out) with ean ${CODE} ===`);
  for (const d of store.dispatches) if (d.ean === CODE) console.log(`  ${d.date || d.createdAt?.slice(0,10)}  ${whName(d.warehouseId)}  qty=${d.quantity}  inv=${d.invoiceNo || "-"}`);

  console.log(`\n=== adjustments with ean ${CODE} ===`);
  for (const a of store.adjustments || []) if (a.ean === CODE) console.log(`  ${a.date || a.createdAt?.slice(0,10)}  ${whName(a.warehouseId)}  delta=${a.quantity ?? a.delta}`);

  // Also: any receipt/stock rows whose ean is a barcode of the product owning CODE?
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
