// Set proper names on Philips B2B masters from philips-dis.pdf (DIS column).
// Keyed by the EXACT db code (12NC) so there is zero code-transcription risk;
// only the NAME is written. Pack-of-N rows collapsed to one base name.
// Backs up the whole store first.  node scripts/apply-philips-desc.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const CHANNEL = "b2b";

// 12NC (db ean)  ->  concise master name (from PDF DIS, pack suffix dropped)
const NAMES = {
  // --- Bulbs / battens / downlights ---
  "915005543301": "Philips Ultron SS Plus 3628 LED Wall Lamp",
  "915006300211": "Philips EcoLink SHW 30W CW B22 LED Bulb",
  "915006301201": "Philips 8.5W B22 Emergency LED Bulb",
  "915006301901": "Philips SB T-Beamer 20W Emergency LED Bulb B22",
  "915006302001": "Philips 20W Emergency LED Bulb",
  "915006305701": "Philips T-Beamer 20W White Tunable WiFi Smart LED Bulb B22",
  "915006305801": "Philips SereneShine NightLamp PnP CW 0.5W",
  "915006307401": "Philips SereneShine NightLamp PnP WW 0.5W",
  "915006307601": "Philips Motion Sensing LED Bulb 15W 6500K B22",
  "915006307701": "Philips Motion Sensing LED Bulb 25W 6500K B22",
  "915006307801": "Philips AceBright SHW 65W CW B22 LED Bulb",
  "915006308201": "Philips SceneSwitch 12W CDL/NW/WW B22 LED Bulb",
  "915006308301": "Philips SceneSwitch 18W CDL/NW/WW B22 LED Bulb",
  "915006308401": "Philips SceneSwitch 30W CDL/NW/WW B22 LED Bulb",
  "915006310101": "Philips 12W 6500K B22 Emergency LED Bulb",
  "915006310301": "Philips SB T-Bulb 12W Emergency B22 LED Bulb",
  "915006410101": "Philips Flexishine 8W 120 LED 5 Meter Strip WW",
  "915006550101": "Philips StarBright Wide 20W CDL LED Batten",
  "915006550201": "Philips StarBright Wide 40W CDL LED Batten",
  "915006550301": "Philips StarBright Wide 50W CDL LED Batten",
  "915006551501": "Philips SlimLine Ultra 20W NW Downlight",
  "915006551701": "Philips SlimLine Ultra 20W CDL Downlight",
  "915006552801": "Philips Gleam Glow LED Batten WW+WW",
  "915006552901": "Philips Gleam Glow LED Batten WW+CDL",
  "915006553001": "Philips Dual Glow LED Batten WW+WW",
  "915006553101": "Philips Dual Glow LED Batten WW+CDL",
  "915006555201": "Philips 3 in 1 36W LED Batten",
  "915006556101": "Philips StarBright Wide Plus 70W CDL LED Batten",
  "915006556201": "Philips SlimLine Elite 50W CDL LED Batten",
  "915006556501": "Philips 3 in 1 20W LED Batten",
  "915006556601": "Philips 3 in 1 30W LED Batten",
  "915006556701": "Philips Ujjawal Neo 25W CDL LED Bulb",
  "915006556801": "Philips Ujjawal Neo 30W CDL LED Bulb",
  "915006556901": "Philips Ujjawal Neo 36W CDL LED Bulb",
  "915006557001": "Philips Ecolink Radiant 30W CDL LED Bulb",
  "915006557101": "Philips SlimLine Advance Plus 60W 6500K LED Batten",
  "915006557201": "Philips EcoLink Tricolour LED Batten",
  "915006558401": "Philips SlimLine Advance Plus 80W 6500K LED Batten",
  "915006558501": "Philips StarBright Wide Nxt 3 in 1 50W LED Batten",
  "915006558601": "Philips StarBright Wide Nxt 3 in 1 20W LED Batten",
  "915006602201": "Philips Smart Wi-Fi LED VEGA 22W RGB",
  "915006603001": "Philips Smart Wi-Fi 20W TW Batten",
  "915006611701": "Philips Smart Wi-Fi 24W TW Batten NXT",
  "915006612001": "Philips Wi-Fi Ebony Pro RGBIC Light 5W",
  "919215850070": "Philips Comet LED Light",
  "919215850331": "Philips Ultron LED WallLight WW 17W 1350lm",
  "919215850332": "Philips Ultron LED WallLight CW 17W 1350lm",
  "919215850862": "Philips Blaze Rechargeable LED Lantern 15W",
  "919215851298": "Philips LUCENT Vertical 10W IP65 LED Wall Light",
  "919215851301": "Philips LUCENT 2-Way 5W IP65 LED Wall Light",
  "919215851303": "Philips LUCENT Round 10W IP65 LED Wall Light",
  "919215851319": "Philips LUCENT 2-Way 7W IP65 LED Wall Light",
  "919215851407": "Philips SlimLine Compact 2ft 20W 2000lm LED Batten",
  "919515812892": "Philips SlimLine Compact 2ft 20W 2000lm LED Batten",
  "919515813613": "Philips SlimLine Advance 36W 3600lm LED Batten CDL",
  "919515813703": "Philips Mirolta Pro 36W 4ft LED Batten CDL 6500K",
  "919515814441": "Philips TwinGlow 20W Regular LED Batten",
  "919515815101": "Philips TwinGlow 25W Regular LED Batten",
  "919615898491": "Philips SlimLine Ultra 5W CDL Downlight",
  "919615898494": "Philips SlimLine Ultra 10W CDL Downlight",
  "919615898498": "Philips Ujjwal 20W LED Batten CDL V2 (SC)",
  // --- Night lamps / indicators ---
  "929000253194": "Philips JoyVision Coral Rush Red 0.5W LED Night Lamp",
  "929000253494": "Philips JoyVision Coral Rush Yellow 0.5W LED Night Lamp",
  "929000262094": "Philips JoyVision Coral Rush White 0.5W LED Night Lamp",
  "929002480102": "Philips Filament LED 4W B35 2700K E14",
  // --- Downlights / surface ---
  "929003093401": "Philips 6W Square Rimless Surface Downlight CDL",
  "929003094601": "Philips 18W Square Rimless Surface Downlight CDL",
  "929003638301": "Philips 12W Square Rimless Surface Downlight CDL",
  // --- Bulbs ---
  "929003506813": "Philips SB T-Bulb Curvy 18W 6500K B22 LED Bulb",
  "929003546414": "Philips 9W Motion Sensing LED Bulb B22",
  // --- Strips ---
  "929003591601": "Philips LED Strip Profile Shine 240 LEDs WW",
  "929003591701": "Philips LED Strip Profile Shine 240 LEDs NW",
  "929003591801": "Philips LED Strip Profile Shine 240 LEDs CDL",
  // --- Ceiling / smart ---
  "929003613001": "Philips 20W Smart WiFi LED Ceiling Light",
  "929003613101": "Philips Smart WiFi Plug 6-16A",
  "929003697401": "Philips Smart Wi-Fi 10A Smart Plug",
  // --- AceBright bulbs ---
  "929003649901": "Philips AceBright 16W CW B22 LED Bulb",
  "929003650001": "Philips AceBright 16W CW E27 LED Bulb",
  "929003650201": "Philips AceBright 18W CW E27 LED Bulb",
  "929003650501": "Philips AceBright 26W CW B22 LED Bulb",
  "929003650601": "Philips AceBright 26W CW E27 LED Bulb",
  "929003675101": "Philips AceBright 16W WW B22 LED Bulb",
  "929003675201": "Philips AceBright 16W WW E27 LED Bulb",
  "929003675301": "Philips AceBright 18W WW B22 LED Bulb",
  "929003675401": "Philips AceBright 18W WW E27 LED Bulb",
  "929003671711": "Philips EcoLink 10W Motion Sensing LED Bulb CW B22",
  "929004220801": "Philips LED Orbit Lamp 18W CW B22",
  "929004243401": "Philips AceBright HW 20W CW B22 LED Bulb",
  "929004650001": "Philips GoldPerform 25W 2800lm WW LED Bulb",
  "929004650101": "Philips GoldPerform 25W 2800lm CDL LED Bulb",
  // --- BrightSpot / Astraspot spotlights ---
  "929003682601": "Philips BrightSpot 6W Tiltable LED Spotlight CDL",
  "929003682701": "Philips BrightSpot 6W Tiltable LED Spotlight WW",
  "929003701801": "Philips BrightSpot 3W Tiltable LED Spotlight WW",
  "929003701901": "Philips BrightSpot 3W Tiltable LED Spotlight NW",
  "929003702001": "Philips BrightSpot 3W Tiltable LED Spotlight CDL",
  "929003728401": "Philips BrightSpot 6W Tiltable LED Spotlight NW",
  "929003746701": "Philips BrightSpot 12W Tiltable LED Spotlight WW",
  "929003746801": "Philips BrightSpot 12W Tiltable LED Spotlight NW",
  "929003746901": "Philips BrightSpot 12W Tiltable LED Spotlight CDL",
  "929003747601": "Philips Astraspot 7W 3in1 LED COB Spotlight",
  "929003747701": "Philips Astraspot 12W 3in1 LED COB Spotlight",
  // --- Scene switch / T-Beamer ---
  "929003771501": "Philips Scene Switch 10W 850lm WW/NW/CW B22 LED Bulb",
  "929003777101": "Philips T-Beamer DOB 20W 2000lm 6500K B22 LED Bulb",
  "929003821901": "Philips T-Beamer 20W Scene Switch B22 GS LED Bulb",
  // --- Smart WiFi downlights (WiZ Prime Neo) ---
  "929003824201": "Philips Smart Wi-Fi 15W LED Surface Downlight",
  "929003824301": "Philips WiZ Prime Neo 10W Round Smart WiFi LED Downlight",
  "929003824401": "Philips WiZ Prime Neo 10W Square Smart WiFi LED Downlight",
  "929003824501": "Philips WiZ Prime Neo 15W Round Smart WiFi LED Downlight",
  "929003824601": "Philips WiZ Prime Neo 15W Square Smart WiFi LED Downlight",
  // --- Inverter / emergency ---
  "929003842301": "Philips Reserve Plus Inverter 10W LED Bulb",
  "929003842401": "Philips Reserve Plus Inverter 20W LED Bulb",
  // --- Motion sensing step-dim downlights ---
  "929003847101": "Philips Motion Sensing Step Dim Downlight PC 10W CDL",
  "929003847201": "Philips Motion Sensing Step Dim Downlight PC 20W CDL",
  "929003847501": "Philips Ecolink Radiant 40W CDL LED Bulb",
  // --- Smart WiFi battens ---
  "929003861701": "Philips Smart Wi-Fi 20W Color Batten",
  "929004238001": "Philips Smart Wi-Fi 4ft Batten 24W 2600lm White Tunable",
  // --- Mirror lights ---
  "929004650701": "Philips CrownGlow Mirror Light 20W CDL",
  "929004650801": "Philips CrownGlow Mirror Light 20W WW",
  "929004650901": "Philips ForeGlow Mirror Light 20W CDL",
  "929004656201": "Philips ForeGlow Mirror Light 20W WW",
  "929004658101": "Philips ArchGlow Mirror Light 20W WW",
  "929004658201": "Philips ArchGlow Mirror Light 20W CDL",
  // --- EcoLink accessories: doorbells / multiplugs / surge guards ---
  "913713666601": "Philips EcoLink Extension Reel 6A 4 Meter",
  "913715174001": "Philips EcoLink Multiplug Socket 6A",
  "913715174101": "Philips EcoLink 4 Way Multiplug 6A",
  "913715174301": "Philips EcoLink Guardian Chief 4 Socket Extension Board 6A 1.5 Meter",
  "913715174701": "Philips EcoLink 4 Socket Spike & Surge Guard 6A Grey Supremo 1.5 Meter",
  "913715278501": "Philips EcoLink Ding Dong Doorbell - Blue",
  "913715278601": "Philips EcoLink Ding Dong Doorbell - Grey",
  "913715278701": "Philips EcoLink Musical Doorbell - Cyan",
  "913715278801": "Philips EcoLink Musical Doorbell - Grey",
  "913715308101": "Philips EcoLink Church Doorbell",
  "913715308201": "Philips EcoLink Gayatri Mantra Doorbell",
  "915006653501": "Philips DurroEco Switch & Socket Combined Box 6/16A",
  "915006653601": "Philips EcoLink 4 Socket Surge & Spike Guard Defender 6A 1.5 Meter",
  "915006670301": "Philips EcoLink T Multiplug 6A PowerPlus",
  "915006670501": "Philips EcoLink Tower Extension 6A PowerPlus",
  "915006670601": "Philips EcoLink 3 Socket 6A + USB A & C PowerPlus",
  "915006670701": "Philips EcoLink 4 Socket 4 Switch 6A PowerPlus",
  "915006671001": "Philips EcoLink Power Bun 6A + USB A & C PowerPlus",
};

function envVal(text, key) {
  const m = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "mi"));
  return m ? m[1].trim() : undefined;
}

async function main() {
  const env = await readFile(".env.local", "utf8");
  const uri = envVal(env, "MONGODB_URI");
  const dbName = envVal(env, "MONGODB_DB") || "inventory";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const col = client.db(dbName).collection("app");
  const store = (await col.findOne({ _id: "store" })).data;
  await writeFile("import-backup-philips-desc.json", JSON.stringify(store));

  const byEan = new Map();
  for (const p of store.products) if (p.channel === CHANNEL) byEan.set(p.ean, p);

  let updated = 0;
  const missing = [];
  for (const [code, name] of Object.entries(NAMES)) {
    const p = byEan.get(code);
    if (!p) { missing.push(code); continue; }
    p.name = name;
    updated++;
  }

  // Philips masters that still have a placeholder name (no PDF row).
  const stillPlaceholder = store.products
    .filter((p) => p.channel === CHANNEL && /philips/i.test(p.brand || "") && /^Philips \d{10,}$/.test(p.name || ""))
    .map((p) => p.ean);

  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });
  console.log(`\n✓ Philips descriptions applied.`);
  console.log(`  names updated: ${updated} / ${Object.keys(NAMES).length}`);
  console.log(`  missing (in map, not in db): ${missing.length ? missing.join(", ") : "none"}`);
  console.log(`  still placeholder (no PDF row): ${stillPlaceholder.length ? stillPlaceholder.join(", ") : "none"}`);
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
