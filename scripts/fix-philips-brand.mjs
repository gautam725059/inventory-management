// Set brand="Philips" on B2B products that are clearly Philips (12NC numeric code
// or a Philips sub-brand name: EcoLink, AceBright/AceSaver, Ujjwal, T-Bulb,
// StarFit, etc.) but have a BLANK brand — so the Philips tile counts them.
// Only blank-brand products; never overwrites an existing brand; only the brand
// field is written. Backs up the whole store first.
//   node scripts/fix-philips-brand.mjs --dry   (preview)
//   node scripts/fix-philips-brand.mjs         (apply)
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}
const DRY = process.argv.includes("--dry");

function brandOf(p){
  const n=(p.name||"").toLowerCase(); const ean=p.ean||"";
  if(/orient/.test(n) || /^LED\d+W(BL|BH|PL|DL|BT|SL|HD)/i.test(ean)) return "Orient";
  if(/^\d{8,}$/.test(ean)) return /\b(wipro|garnet)\b/.test(n) ? "Wipro" : "Philips"; // 12NC = Philips
  if(/philips|ecolink|ace ?(bright|saver)|ujjaw|ujjwal|t-?bulb|joyvision|slim ?line|blaze|\bwiz\b|star ?fit|astraspot|full glow|pocket pal|\bhue\b/.test(n)) return "Philips";
  if(/\b(garnet|wipro|emerald|safelite|coral|northwest)\b/.test(n)) return "Wipro";
  if(/^(N\d|NE\d|NS\d|D\d|DD\d|DJ\d|DE\d|DF\d|DG\d|DH\d|DL\d|SB\d|WM|WEN|WR\d|NW|CL\d)/i.test(ean)) return "Wipro";
  return "Unknown";
}

async function main(){
  const env=await readFile(".env.local","utf8");
  const client=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await client.connect();
  const col=client.db(envVal(env,"MONGODB_DB")||"inventory").collection("app");
  const store=(await col.findOne({_id:"store"})).data;

  const targets = store.products.filter(
    (p)=> p.channel==="b2b" && !(p.brand && String(p.brand).trim()) && brandOf(p)==="Philips"
  );

  console.log(`B2B products with BLANK brand that are clearly Philips: ${targets.length}`);
  for(const p of targets.slice(0,40)) console.log(`  ${p.ean.padEnd(16)}  ${(p.name||"").slice(0,55)}`);
  if(targets.length>40) console.log(`  … and ${targets.length-40} more`);

  if(DRY){ console.log(`\n(dry run — nothing changed)`); await client.close(); return; }
  if(targets.length===0){ console.log(`Nothing to fix.`); await client.close(); return; }

  await writeFile("import-backup-philips-brand-fix.json", JSON.stringify(store));
  for(const p of targets) p.brand="Philips";
  await col.replaceOne({_id:"store"},{data:store},{upsert:true});
  console.log(`\n✓ brand="Philips" set on ${targets.length} products. Backup: import-backup-philips-brand-fix.json`);
  await client.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
