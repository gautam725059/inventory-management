import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\s*${k}\s*=\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}
async function main(){
  const env=await readFile(".env.local","utf8");
  const client=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await client.connect();
  const store=(await client.db(envVal(env,"MONGODB_DB")||"inventory").collection("app").findOne({_id:"store"})).data;
  const o=store.products.filter(p=>p.channel==="b2b"&&/orient/i.test(p.brand||""));
  o.sort((a,b)=>a.ean.localeCompare(b.ean));
  const named=o.filter(p=>!/^Orient(\s+Electric)?\s+LED\w/i.test(p.name||"")&&!/^Orient\s+LED/i.test(p.name||""));
  const placeholder=o.filter(p=>/^Orient\s+LED/i.test(p.name||""));
  console.log("Orient masters:",o.length,"| named:",o.length-placeholder.length,"| placeholder:",placeholder.length);
  console.log("\n=== ALL ===");
  console.log(o.map(p=>`${p.ean}\t${(p.name||"").replace(/\s+/g," ")}`).join("\n"));
  await client.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
