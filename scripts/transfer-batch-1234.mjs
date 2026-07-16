// Move the mistaken Jul-16 Bill-1234 stock-in batch from Haryana(B2B) to
// Mumbai(B2B). Deducts from source, adds to destination, logs a transfer in both
// warehouses' history. Backs up the whole store first. Reversible.
//   node scripts/transfer-batch-1234.mjs
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}

const SRC="wh-delhi-b2b", DST="wh-mumbai-b2b", BILL="1234", DATE="2026-07-16";
const NOTE="Mistaken stock-in (Bill 1234) moved Haryana → Mumbai";

async function main(){
  const env=await readFile(".env.local","utf8");
  const client=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await client.connect();
  const col=client.db(envVal(env,"MONGODB_DB")||"inventory").collection("app");
  const store=(await col.findOne({_id:"store"})).data;

  // The exact batch: Bill 1234 receipts into Haryana(B2B) recorded on Jul 16.
  const recs=store.receipts.filter(r=>
    r.warehouseId===SRC && String(r.bill||"").trim()===BILL && (r.createdAt||"").slice(0,10)===DATE);
  const perEan=new Map();
  for(const r of recs) perEan.set(r.ean,(perEan.get(r.ean)||0)+r.quantity);
  if(perEan.size===0){ console.log("No matching batch found — nothing to do."); await client.close(); return; }

  await writeFile("import-backup-transfer-1234.json", JSON.stringify(store));
  const admin=store.users.find(u=>u.role==="admin"&&u.active)||store.users.find(u=>u.role==="admin");
  const by=admin?{id:admin.id,name:admin.name}:undefined;
  const now=new Date().toISOString();

  let movedPcs=0, movedLines=0; const skipped=[];
  for(const [ean,wantQty] of perEan){
    const srcRow=store.stock.find(s=>s.warehouseId===SRC && s.ean===ean);
    const have=srcRow?.quantity??0;
    const qty=Math.min(wantQty,have);
    if(qty<=0){ skipped.push(`${ean} (0 in stock)`); continue; }
    srcRow.quantity-=qty;
    let dstRow=store.stock.find(s=>s.warehouseId===DST && s.ean===ean);
    if(!dstRow){ dstRow={warehouseId:DST,ean,quantity:0}; store.stock.push(dstRow); }
    dstRow.quantity+=qty;
    store.transfers.push({
      id:randomUUID(), fromWarehouseId:SRC, toWarehouseId:DST, ean, quantity:qty,
      note:NOTE, byId:by?.id, byName:by?.name, createdAt:now,
    });
    movedPcs+=qty; movedLines++;
    const nm=store.products.find(p=>p.ean===ean&&p.channel==="b2b")?.name??ean;
    console.log(`  moved ${String(qty).padStart(4)}  ${ean.padEnd(14)} ${String(nm).slice(0,40)}`);
  }

  await col.replaceOne({_id:"store"},{data:store},{upsert:true});
  console.log(`\n✓ Transferred ${movedLines} products, ${movedPcs} pcs: Haryana(B2B) → Mumbai(B2B).`);
  if(skipped.length) console.log(`  skipped: ${skipped.join(", ")}`);
  console.log(`  backup: import-backup-transfer-1234.json`);
  await client.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
