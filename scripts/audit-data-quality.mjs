// READ-ONLY: snapshot of data-quality issues worth automating away.
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}
async function main(){
  const env=await readFile(".env.local","utf8");
  const c=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await c.connect();
  const d=(await c.db(envVal(env,"MONGODB_DB")||"inventory").collection("app").findOne({_id:"store"})).data;

  const P=d.products;
  const stockByEan=new Map();
  for(const s of d.stock) stockByEan.set(s.ean,(stockByEan.get(s.ean)??0)+s.quantity);

  const placeholder=P.filter(p=>/^(Wipro|Orient|Philips)\s+[A-Z0-9-]+$/i.test(p.name||""));
  const noBrand=P.filter(p=>!p.brand);
  const noStockNoMove=P.filter(p=>(stockByEan.get(p.ean)??0)===0);
  const noPrice=P.filter(p=>p.sellingPrice==null);
  const noReorder=P.filter(p=>!p.reorderLevel);
  const noImage=P.filter(p=>!p.imageUrl);

  // near-duplicate codes (1 char apart, same channel) -> typo-created orphans
  const near=[];
  const byCh={};
  for(const p of P)(byCh[p.channel]??=[]).push(p.ean);
  function close(a,b){
    if(Math.abs(a.length-b.length)>1)return false;
    if(a.length===b.length){let d=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i]&&++d>1)return false;return d===1;}
    const [s,l]=a.length<b.length?[a,b]:[b,a];
    let i=0,j=0,d=0;
    while(i<s.length&&j<l.length){ if(s[i]===l[j]){i++;j++;} else { if(++d>1)return false; j++; } }
    return true;
  }
  for(const ch of Object.keys(byCh)){
    const list=byCh[ch];
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)
      if(close(list[i],list[j])) near.push(`${ch}: ${list[i]} ~ ${list[j]}`);
  }

  const totalMovements=d.receipts.length+d.dispatches.length+d.adjustments.length+d.transfers.length+d.comboDispatches.length;
  const withBy=[...d.receipts,...d.dispatches,...d.adjustments,...d.transfers,...d.comboDispatches].filter(m=>m.byName).length;

  console.log(`products                : ${P.length}`);
  console.log(`  placeholder names     : ${placeholder.length}  ${placeholder.slice(0,6).map(p=>p.ean).join(", ")}`);
  console.log(`  no brand              : ${noBrand.length}`);
  console.log(`  zero stock everywhere : ${noStockNoMove.length}`);
  console.log(`  no selling price      : ${noPrice.length}   <- value/report blind spots`);
  console.log(`  no reorder level      : ${noReorder.length}   <- low-stock alert never fires`);
  console.log(`  no image              : ${noImage.length}`);
  console.log(`near-duplicate codes    : ${near.length}`);
  for(const n of near.slice(0,12)) console.log(`    ${n}`);
  console.log(`\nmovements total         : ${totalMovements}`);
  console.log(`  with "By" recorded    : ${withBy}  (rest are pre-audit-trail)`);
  console.log(`warehouses              : ${d.warehouses.length}`);
  console.log(`users                   : ${d.users.length}  | sessions: ${d.sessions.length}`);
  console.log(`pending approvals       : ${d.approvals.filter(a=>a.status==="pending").length}`);
  console.log(`open POs                : ${d.purchaseOrders.filter(p=>p.status!=="received").length}`);
  await c.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
