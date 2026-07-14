// READ-ONLY: show exactly what stock sits in the Mumbai (e-com) warehouse, so we
// know the full impact BEFORE zeroing anything.
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}
async function main(){
  const env=await readFile(".env.local","utf8");
  const c=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await c.connect();
  const d=(await c.db(envVal(env,"MONGODB_DB")||"inventory").collection("app").findOne({_id:"store"})).data;

  // Confirm the warehouse identity.
  const wh = d.warehouses.find(w=>w.id==="wh-mumbai");
  console.log(`Target warehouse: id=wh-mumbai | name="${wh?.name}" | location="${wh?.location}" | channel=${wh?.channel}`);
  console.log(`(Note: the B2B Mumbai warehouse is a separate id "wh-mumbai-b2b" and will NOT be touched.)\n`);

  const nameFor = (ean)=> d.products.find(p=>p.ean===ean && p.channel==="ecom")?.name
                        ?? d.products.find(p=>p.ean===ean)?.name ?? "(unknown)";

  const rows = d.stock.filter(s=>s.warehouseId==="wh-mumbai");
  const nonZero = rows.filter(s=>s.quantity>0).sort((a,b)=>b.quantity-a.quantity);
  const totalPieces = nonZero.reduce((t,s)=>t+s.quantity,0);

  console.log(`stock lines in wh-mumbai : ${rows.length} (with qty>0: ${nonZero.length})`);
  console.log(`TOTAL PIECES to be zeroed: ${totalPieces.toLocaleString()}\n`);
  console.log("Top 20 by quantity:");
  for(const s of nonZero.slice(0,20)) console.log(`  ${String(s.quantity).padStart(7)}  ${s.ean}  ${nameFor(s.ean)}`);
  if(nonZero.length>20) console.log(`  … and ${nonZero.length-20} more lines`);
  await c.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
