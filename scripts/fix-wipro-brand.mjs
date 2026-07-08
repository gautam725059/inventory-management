// The 13 Wipro B2B masters imported with brand=null got skipped by the Wipro
// naming pass. They are unmistakably Wipro (name already "Wipro <SKU>"). Set
// brand="Wipro" so they group correctly. NAMES are left for the DIS sheet.
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
const SKUS = ["NE9011","E10016","NS9400","E10017","D54265","D532065","D532200","N30101","NS1220","CLL0011","DSC2150","CL0005","D350327"];
function envVal(t,k){const m=t.match(new RegExp(`^\s*${k}\s*=\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}
const env=await readFile(".env.local","utf8");
const c=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});await c.connect();
const col=c.db(envVal(env,"MONGODB_DB")||"inventory").collection("app");
const store=(await col.findOne({_id:"store"})).data;
await writeFile("import-backup-wipro-brand-fix.json", JSON.stringify(store));
const set=new Set(SKUS); let n=0;
for(const p of store.products){ if(p.channel==="b2b"&&set.has(p.ean)&&(!p.brand)){ p.brand="Wipro"; n++; console.log("  brand set:",p.ean); } }
await col.replaceOne({_id:"store"},{data:store},{upsert:true});
console.log(`\n✓ brand=Wipro set on ${n} products.`);
await c.close();
