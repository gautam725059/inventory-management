// Zero ALL stock in ONE warehouse, logging each reduction as an adjustment so it
// shows in History (reason + who did it). Backs up the whole store first.
// Only the given warehouse id is touched — nothing else.
//
//   node scripts/zero-warehouse-stock.mjs <warehouseId> [--dry]
//   e.g. node scripts/zero-warehouse-stock.mjs wh-delhi-b2b --dry
//        node scripts/zero-warehouse-stock.mjs wh-delhi-b2b
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}

const WH = process.argv[2];
const DRY = process.argv.includes("--dry");
const REASON = "Warehouse stock reset";

if(!WH){ console.error("usage: node scripts/zero-warehouse-stock.mjs <warehouseId> [--dry]"); process.exit(1); }

async function main(){
  const env=await readFile(".env.local","utf8");
  const client=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await client.connect();
  const col=client.db(envVal(env,"MONGODB_DB")||"inventory").collection("app");
  const store=(await col.findOne({_id:"store"})).data;

  const wh = store.warehouses.find(w=>w.id===WH);
  if(!wh){ console.error(`✗ warehouse "${WH}" not found. Known: ${store.warehouses.map(w=>w.id).join(", ")}`); process.exit(1); }

  const nameFor=(ean)=> store.products.find(p=>p.ean===ean&&p.channel===wh.channel)?.name
                     ?? store.products.find(p=>p.ean===ean)?.name ?? "(unknown)";

  const rows = store.stock.filter(s=>s.warehouseId===WH && s.quantity>0);
  const pieces = rows.reduce((t,s)=>t+s.quantity,0);

  console.log(`Target: ${WH} | name="${wh.name}" | location="${wh.location}" | channel=${wh.channel}`);
  console.log(`Lines with stock: ${rows.length} | total pieces: ${pieces.toLocaleString()}\n`);
  for(const s of [...rows].sort((a,b)=>b.quantity-a.quantity).slice(0,15))
    console.log(`  ${String(s.quantity).padStart(7)}  ${s.ean}  ${nameFor(s.ean)}`);
  if(rows.length>15) console.log(`  … and ${rows.length-15} more lines`);

  if(DRY){ console.log(`\n(dry run — nothing changed)`); await client.close(); return; }
  if(rows.length===0){ console.log(`\nAlready zero — nothing to do.`); await client.close(); return; }

  const backup = `import-backup-zero-${WH}.json`;
  await writeFile(backup, JSON.stringify(store));

  const admin = store.users.find(u=>u.role==="admin"&&u.active) || store.users.find(u=>u.role==="admin");
  const by = admin ? { id: admin.id, name: admin.name } : undefined;
  const now = new Date().toISOString();

  for(const row of rows){
    store.adjustments.push({
      id: randomUUID(), warehouseId: WH, ean: row.ean,
      delta: -row.quantity, reason: REASON,
      byId: by?.id, byName: by?.name, createdAt: now,
    });
    row.quantity = 0;
  }

  await col.replaceOne({_id:"store"},{data:store},{upsert:true});

  const after=(await col.findOne({_id:"store"})).data;
  const left=after.stock.filter(s=>s.warehouseId===WH && s.quantity>0);
  console.log(`\n✓ ${wh.name} (${wh.channel}) stock zeroed.`);
  console.log(`  lines zeroed       : ${rows.length}`);
  console.log(`  pieces removed     : ${pieces.toLocaleString()}`);
  console.log(`  attributed to      : ${by?.name ?? "(none)"}`);
  console.log(`  adjustments logged : ${rows.length}  (reason "${REASON}")`);
  console.log(`  qty>0 remaining    : ${left.length}  (expect 0)`);
  console.log(`  backup             : ${backup}`);
  await client.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
