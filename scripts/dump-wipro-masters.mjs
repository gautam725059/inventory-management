// READ-ONLY: dump all Wipro B2B master SKUs + current name, so we assign names
// keyed by the EXACT db SKU (no sku-transcription risk).
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\s*${k}\s*=\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}
async function main(){
  const env=await readFile(".env.local","utf8");
  const client=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await client.connect();
  const store=(await client.db(envVal(env,"MONGODB_DB")||"inventory").collection("app").findOne({_id:"store"})).data;
  const wip=store.products.filter(p=>p.channel==="b2b"&&/wipro/i.test(p.brand||""));
  wip.sort((a,b)=>a.ean.localeCompare(b.ean));
  const lines=wip.map(p=>`${p.ean}\t${(p.name||"").replace(/\s+/g," ")}`);
  await writeFile("wipro-masters.tsv", lines.join("\n"));
  console.log("Wipro masters:",wip.length);
  console.log(lines.join("\n"));
  await client.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
