// READ-ONLY: find the mistaken stock-in batch (Bill 1234) so we can transfer it
// Haryana(B2B) -> Mumbai(B2B). Shows per-EAN received qty vs what's in stock now.
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}

const SRC = "wh-delhi-b2b";   // Haryana (B2B)
const DST = "wh-mumbai-b2b";  // Mumbai (B2B)
const BILL = "1234";

async function main(){
  const env=await readFile(".env.local","utf8");
  const c=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await c.connect();
  const d=(await c.db(envVal(env,"MONGODB_DB")||"inventory").collection("app").findOne({_id:"store"})).data;

  const wh = (id)=> d.warehouses.find(w=>w.id===id);
  console.log(`SRC ${SRC} = "${wh(SRC)?.name}" (${wh(SRC)?.channel})  ->  DST ${DST} = "${wh(DST)?.name}" (${wh(DST)?.channel})\n`);

  // Receipts with this bill, grouped by warehouse + ean.
  const recs = d.receipts.filter(r=>String(r.bill||"").trim()===BILL);
  const byWh={};
  for(const r of recs) byWh[r.warehouseId]=(byWh[r.warehouseId]||0)+1;
  console.log(`Receipts with Bill "${BILL}" by warehouse: ${Object.entries(byWh).map(([w,n])=>`${w}=${n}`).join(", ")}`);
  const dates=[...new Set(recs.map(r=>(r.createdAt||"").slice(0,10)))];
  console.log(`Dates: ${dates.join(", ")}\n`);

  const srcRecs = recs.filter(r=>r.warehouseId===SRC);
  const perEan = new Map();
  for(const r of srcRecs) perEan.set(r.ean,(perEan.get(r.ean)||0)+r.quantity);

  const nameOf=(ean)=> d.products.find(p=>p.ean===ean&&p.channel===wh(SRC).channel)?.name ?? d.products.find(p=>p.ean===ean)?.name ?? ean;
  const stockOf=(ean)=> d.stock.find(s=>s.warehouseId===SRC&&s.ean===ean)?.quantity ?? 0;

  let totRecv=0, totMovable=0;
  console.log(`Bill ${BILL} batch in ${SRC} — ${perEan.size} products:`);
  console.log(`  received | in-stock-now |  ean            name`);
  for(const [ean,q] of [...perEan].sort((a,b)=>b[1]-a[1])){
    const have=stockOf(ean); const movable=Math.min(q,have);
    totRecv+=q; totMovable+=movable;
    const flag = have<q ? `  ⚠ only ${have} in stock` : "";
    console.log(`  ${String(q).padStart(7)} | ${String(have).padStart(11)} |  ${ean.padEnd(14)} ${nameOf(ean).slice(0,40)}${flag}`);
  }
  console.log(`\n  TOTAL received in batch: ${totRecv}`);
  console.log(`  TOTAL movable now (capped at current stock): ${totMovable}`);
  await c.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
