// READ-ONLY: for each Wipro orphan, show whether it carries stock / history and
// whether a same-or-similar SKU exists elsewhere in the store (typo / duplicate check).
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}

const ORPHANS = ["NE9011","E10016","E10017","NS9400","NS1220","D54265","D532065","D532200","D350327","CL0005","CLL0011","DSC2150"];

async function main(){
  const env=await readFile(".env.local","utf8");
  const client=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await client.connect();
  const store=(await client.db(envVal(env,"MONGODB_DB")||"inventory").collection("app").findOne({_id:"store"})).data;

  const allEans = new Set(store.products.map(p=>p.ean));

  // total stock per ean across warehouses
  const stock = new Map();
  for (const w of store.warehouses ?? []) {
    for (const l of w.lines ?? w.stock ?? []) {
      stock.set(l.ean, (stock.get(l.ean) ?? 0) + (l.quantity ?? 0));
    }
  }

  console.log("orphan | channel | totalStock | movements | similar SKUs already in store");
  for (const sku of ORPHANS) {
    const p = store.products.find(x=>x.ean===sku);
    const moves = (store.movements ?? []).filter(m=>m.ean===sku).length;
    // similar = same first 3 chars, edit-distance-ish (length within 1, shares prefix)
    const similar = [...allEans].filter(e=>e!==sku && e.slice(0,3)===sku.slice(0,3) && Math.abs(e.length-sku.length)<=1);
    console.log(`${sku} | ${p?.channel ?? "-"} | ${stock.get(sku) ?? 0} | ${moves} | ${similar.join(", ") || "none"}`);
  }
  await client.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
