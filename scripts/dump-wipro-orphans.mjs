// READ-ONLY: dump the exact SKU + current name of every Wipro B2B product whose
// name is still the raw placeholder "Wipro <SKU>" (the orphans we must name).
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}
async function main(){
  const env=await readFile(".env.local","utf8");
  const client=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await client.connect();
  const store=(await client.db(envVal(env,"MONGODB_DB")||"inventory").collection("app").findOne({_id:"store"})).data;
  const wp=store.products.filter(p=>p.channel==="b2b"&&/wipro/i.test(p.brand||""));
  const orphans=wp.filter(p=>p.name===`Wipro ${p.ean}`);
  console.log("Total Wipro b2b:",wp.length,"| placeholder orphans:",orphans.length);
  for(const p of orphans){
    const asins=(p.barcodes||[]).map(b=>b.ean).join(",");
    console.log(`SKU=${p.ean}\tASINs=[${asins}]\tname="${p.name}"`);
  }
  await client.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
