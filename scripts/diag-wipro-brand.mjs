// READ-ONLY: quantify how much real WIPRO stock the dashboard's Wipro tile misses.
// Dashboard rule: a product is "Wipro" only if brand==="wipro" OR name has "wipro".
// Many Wipro products (Garnet line, raw SKU codes) have blank brand + no "wipro"
// in the name, so they fall through. This classifies B2B stock by LIKELY brand.
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}

const PHILIPS = /philips|ecolink|ujjaw|ujjwal|ace ?(bright|saver)|t-?bulb|joyvision|slim ?line|blaze|\bwiz\b|smart wi-?fi|hue|acebright/i;
const WIPRO   = /wipro|garnet|safelite|northwest|coral|\bnext\b|\bdeco\b/i;
const ORIENT  = /orient|^LED\d+W(BL|BH|PL|DL|BT|SL|HD)/i;
// Wipro SKU code shapes (from earlier import work): N/D/DD/DJ/DF/DG/DH/DL/NE/NS/SB/WM/NW…
const WIPRO_SKU = /^(N\d|NE\d|NS\d|D\d|DD\d|DJ\d|DE\d|DF\d|DG\d|DH\d|DL\d|SB\d|WM|WEN|WR\d|NW|CL\d)/i;

function classify(p){
  const n=(p.name||""); const b=(p.brand||"").toLowerCase();
  if(b==="philips"||PHILIPS.test(n)) return "Philips";
  if(/^d{8,}$/.test(p.ean)) { if(b==="wipro"||/wipro|garnet/i.test(n)) return "Wipro"; return (b==="orient"||ORIENT.test(n))?"Orient":"Philips"; }
  if(b==="wipro"||WIPRO.test(n)||WIPRO_SKU.test(p.ean)) return "Wipro";
  if(b==="orient"||ORIENT.test(n)) return "Orient";
  return "Unknown";
}
const dashWipro = (p)=> ((p.brand||"").toLowerCase()==="wipro") || (p.name||"").toLowerCase().includes("wipro");

async function main(){
  const env=await readFile(".env.local","utf8");
  const c=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await c.connect();
  const d=(await c.db(envVal(env,"MONGODB_DB")||"inventory").collection("app").findOne({_id:"store"})).data;
  const b2bWh=d.warehouses.filter(w=>w.channel==="b2b").map(w=>w.id);
  const stockOf=(ean)=>d.stock.filter(s=>b2bWh.includes(s.warehouseId)&&s.ean===ean).reduce((a,s)=>a+s.quantity,0);

  const b2b=d.products.filter(p=>p.channel==="b2b");
  // Real Wipro (by classification) vs what the dashboard shows.
  let realCount=0, realPcs=0, shownCount=0, shownPcs=0, missCount=0, missPcs=0;
  const missing=[];
  for(const p of b2b){
    const q=stockOf(p.ean); if(q<=0) continue;
    const real = classify(p)==="Wipro";
    const shown = dashWipro(p);
    if(real){ realCount++; realPcs+=q; }
    if(shown){ shownCount++; shownPcs+=q; }
    if(real && !shown){ missCount++; missPcs+=q; missing.push({ean:p.ean,name:p.name,brand:p.brand??"(none)",q}); }
  }

  console.log("=== WIPRO on the B2B dashboard ===");
  console.log(`Dashboard SHOWS as Wipro : ${shownCount} products, ${shownPcs.toLocaleString()} pcs`);
  console.log(`REAL Wipro (by our check): ${realCount} products, ${realPcs.toLocaleString()} pcs`);
  console.log(`>> MISSING from tile      : ${missCount} products, ${missPcs.toLocaleString()} pcs`);

  const byBrand={};
  for(const m of missing) byBrand[m.brand]=(byBrand[m.brand]||0)+1;
  console.log(`\nMissing Wipro products by their brand field: ${Object.entries(byBrand).map(([b,n])=>`${b}=${n}`).join(", ")}`);
  console.log(`\nTop 30 real-Wipro products missing from the tile:`);
  for(const m of missing.sort((a,b)=>b.q-a.q).slice(0,30))
    console.log(`  ${String(m.q).padStart(6)}  brand="${m.brand}"  ${m.ean}  ${m.name.slice(0,58)}`);
  await c.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
