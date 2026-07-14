// Zero ALL stock in the Mumbai (e-com) warehouse (id "wh-mumbai"), logging each
// reduction as an adjustment so it shows in History (reason + who did it).
// Backs up the whole store first. Does NOT touch wh-mumbai-b2b or any other wh.
//   node scripts/zero-mumbai-ecom.mjs
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}

const WH = "wh-mumbai";           // Mumbai, e-com channel
const REASON = "Warehouse stock reset";

async function main(){
  const env=await readFile(".env.local","utf8");
  const client=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await client.connect();
  const col=client.db(envVal(env,"MONGODB_DB")||"inventory").collection("app");
  const store=(await col.findOne({_id:"store"})).data;

  // Safety guard: confirm the target is the e-com Mumbai warehouse.
  const wh = store.warehouses.find(w=>w.id===WH);
  if(!wh){ console.error(`✗ warehouse ${WH} not found`); process.exit(1); }
  if(wh.channel!=="ecom"){ console.error(`✗ ${WH} is channel ${wh.channel}, expected ecom — aborting`); process.exit(1); }

  await writeFile("import-backup-mumbai-zero.json", JSON.stringify(store));

  // Attribute the action to the active admin (login is done via script, not UI).
  const admin = store.users.find(u=>u.role==="admin" && u.active) || store.users.find(u=>u.role==="admin");
  const by = admin ? { id: admin.id, name: admin.name } : undefined;

  const now = new Date().toISOString();
  const rows = store.stock.filter(s=>s.warehouseId===WH && s.quantity>0);
  let pieces = 0, lines = 0;
  for(const row of rows){
    const delta = -row.quantity;
    store.adjustments.push({
      id: randomUUID(),
      warehouseId: WH,
      ean: row.ean,
      delta,
      reason: REASON,
      byId: by?.id,
      byName: by?.name,
      createdAt: now,
    });
    pieces += row.quantity;
    lines++;
    row.quantity = 0;
  }

  await col.replaceOne({_id:"store"},{data:store},{upsert:true});

  // Verify.
  const after=(await col.findOne({_id:"store"})).data;
  const remaining=after.stock.filter(s=>s.warehouseId===WH && s.quantity>0);
  console.log(`✓ Mumbai (e-com) stock zeroed.`);
  console.log(`  lines zeroed        : ${lines}`);
  console.log(`  pieces removed      : ${pieces.toLocaleString()}`);
  console.log(`  attributed to       : ${by?.name ?? "(none)"}`);
  console.log(`  adjustments logged  : ${lines}  (reason "${REASON}")`);
  console.log(`  qty>0 lines remaining in wh-mumbai after: ${remaining.length}  (expect 0)`);
  console.log(`  backup              : import-backup-mumbai-zero.json`);
  await client.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
