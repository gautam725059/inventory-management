// Set proper master names on Wipro B2B products from wipro-dis.pdf.
// SKU keys come from the DB dump (exact), only the NAME is transcribed.
// Names only. Backs up the whole store first.  node scripts/apply-wipro-desc.mjs
import { readFile, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";

const CHANNEL = "b2b";

// SKU (exact DB primary code)  ->  concise master name
const NAMES = {
  // Torches / lanterns
  "CL0004": "Wipro Life Lite LED Rechargeable Torch, 230V 50Hz",
  "CL0007": "Wipro Prism LED Torch cum Lantern",
  "CL0009": "Wipro Luster 3W LED Bright Rechargeable Torch (Red and Black)",
  "CL0011": "Wipro 3W Radiant Dual Light LED Torch, Black & Red",

  // Garnet Slim COB Light
  "D320327": "Wipro Garnet 3W Slim COB Light, Warm White",
  "D320340": "Wipro Garnet 3W Slim COB Light, Neutral White",
  "D320365": "Wipro Garnet 3W Slim COB Light, Cool Day White",
  "D320627": "Wipro Garnet 6W Slim COB Light, Warm White",
  "D320640": "Wipro Garnet 6W Slim COB Light, Neutral White",
  "D320665": "Wipro Garnet 6W Slim COB Light, Cool Day White",
  "D320927": "Wipro Garnet 9W Slim COB Light, Warm White",
  "D320940": "Wipro Garnet 9W Slim COB Light, Neutral White",
  "D320965": "Wipro Garnet 9W Slim COB Light, Cool Day White",

  // Alpha 6W CCT Panel
  "D520600": "Wipro Alpha 6W CCT LED Panel Light, 3-in-1 Color Changing (Warm/Neutral/Cool White)",

  // 6W Alpha Downlight for Junction Box (3 inch Cutout, 22mm Height)
  "D520627": "Wipro Alpha 6W Downlight for Junction Box, Warm White (2700K), 3 inch Cutout",
  "D520640": "Wipro Alpha 6W Downlight for Junction Box, Neutral White (4000K), 3 inch Cutout",
  "D520665": "Wipro Alpha 6W Downlight for Junction Box, Cool Day White (6500K), 3 inch Cutout",
  "D520680": "Wipro Alpha 6W Downlight for Junction Box, Blue, 3 inch Cutout, 22mm Height",
  "D520685": "Wipro Alpha 6W Downlight for Junction Box, Pink, 3 inch Cutout, 22mm Height",
  "D520690": "Wipro Alpha 6W Downlight for Junction Box, Red, 3 inch Cutout, 22mm Height",
  "D520695": "Wipro Alpha 6W Downlight for Junction Box, Green, 3 inch Cutout, 22mm Height",

  // Alpha 7W Round Downlight for Junction Box (Glare-Free)
  "D520727": "Wipro Alpha 7W Round Downlight for Junction Box, Warm White (2700K), Glare-Free",
  "D520740": "Wipro Alpha 7W Round Downlight for Junction Box, Neutral White (4000K), Glare-Free",
  "D520765": "Wipro Alpha 7W Round Downlight for Junction Box, Cool Day White (6500K), Glare-Free",
  "D520780": "Wipro Alpha 7W Round Downlight for Junction Box, Blue, Glare-Free Design, Recessed",
  "D520785": "Wipro Alpha 7W Round Downlight for Junction Box, Pink, Glare-Free Design, Recessed",
  "D520790": "Wipro Alpha 7W Round Downlight for Junction Box, Red, Glare-Free Design, Recessed",
  "D520795": "Wipro Alpha 7W Round Downlight for Junction Box, Green, Glare-Free Design, Recessed",

  // Garnet 8W Round Downlight for Junction Box (Glare-Free)
  "D520800": "Wipro Garnet 8W Round Downlight for Junction Box, CCT, Glare-Free Design, Recessed",
  "D520827": "Wipro Garnet 8W Round Downlight for Junction Box, Warm White (2700K), Glare-Free",
  "D520840": "Wipro Garnet 8W Round Downlight for Junction Box, Neutral White (4000K), Glare-Free",
  "D520865": "Wipro Garnet 8W Round Downlight for Junction Box, Cool White (6500K), Glare-Free",
  "D520880": "Wipro Garnet 8W Round Downlight for Junction Box, Blue, Glare-Free Design, Recessed",
  "D520885": "Wipro Garnet 8W Round Downlight for Junction Box, Pink, Glare-Free Design, Recessed",
  "D520890": "Wipro Garnet 8W Round Downlight for Junction Box, Red, Glare-Free Design, Recessed",
  "D520895": "Wipro Garnet 8W Round Downlight for Junction Box, Green, Glare-Free Design, Recessed",

  // Alpha 10W Round Downlight for Junction Box (Glare-Free)
  "D521027": "Wipro Alpha 10W Round Downlight for Junction Box, Warm White (2700K), Glare-Free",
  "D521040": "Wipro Alpha 10W Round Downlight for Junction Box, Neutral White (4000K), Glare-Free",
  "D521065": "Wipro Alpha 10W Round Downlight for Junction Box, Cool Day White (6500K), Glare-Free",
  "D521080": "Wipro Alpha 10W Round Downlight for Junction Box, Blue, Glare-Free Design, Recessed",
  "D521085": "Wipro Alpha 10W Round Downlight for Junction Box, Pink, Glare-Free Design, Recessed",
  "D521090": "Wipro Alpha 10W Round Downlight for Junction Box, Red, Glare-Free Design, Recessed",
  "D521095": "Wipro Alpha 10W Round Downlight for Junction Box, Green, Glare-Free Design, Recessed",

  // Garnet 12W Round Downlight for Junction Box (Glare-Free)
  "D521227": "Wipro Garnet 12W Round Downlight for Junction Box, Warm White (2700K), Glare-Free",
  "D521240": "Wipro Garnet 12W Round Downlight for Junction Box, Neutral White (4000K), Glare-Free",
  "D521265": "Wipro Garnet 12W Round Downlight for Junction Box, Cool White (6500K), Glare-Free",

  // Battens
  "D532665": "Wipro Garnet 26W LED Batten, 6500K",
  "D533665": "Wipro Garnet Plus 36W Aluminium LED Batten, Cool White (6500K)",
  "D535265": "Wipro Garnet 52W LED Batten for Home & Office, Cool Day Light (6500K), 5200 Lumen",
  "D542065": "Wipro Deco M1.1 LED Mirror Light for Wall Picture, Bathroom Vanity & Dressing Table",
  "D542527": "Wipro Garnet 25W LED Batten for Living Room & Bedroom",       // color truncated in sheet
  "D542540": "Wipro Garnet 25W LED Batten for Living Room & Bedroom",       // color truncated in sheet
  "D542565": "Wipro Garnet 25W LED Batten for Living Room & Bedroom",       // color truncated in sheet
  "D543065": "Wipro Garnet 30W LED Batten for Home & Office, 4 Ft",
  "D562065": "Wipro Garnet 20W Square LED Batten, 6500K",
  "D582065": "Wipro Garnet 20W Decorative Batten for Home & Office, Cool Day White (6500K)",

  // Garnet 2W LED Integrated Spotlight
  "D740227": "Wipro Garnet 2W LED Integrated Spotlight, Warm White (2700K)",
  "D740265": "Wipro Garnet 2W LED Integrated Spotlight, Cool White (6500K)",
  "D740280": "Wipro Garnet 2W LED Integrated Spotlight, Blue",
  "D740285": "Wipro Garnet 2W LED Integrated Spotlight, Pink",
  "D740290": "Wipro Garnet 2W LED Integrated Spotlight, Red",
  "D740295": "Wipro Garnet 2W LED Integrated Spotlight, Green",

  // Garnet 1W LED Cabinet COB
  "D910127": "Wipro Garnet 1W LED Cabinet COB, Warm White (2700K)",
  "D910165": "Wipro Garnet 1W LED Cabinet COB, Cool White (6500K)",

  // Rimless Round Surface Panels
  "DD11500": "Wipro Garnet 15W Rimless Round CCT LED Surface Panel, 3-in-1 Colour Changing",
  "DD11565": "Wipro Garnet 15W Rimless Round LED Surface Panel, Cool Day White (6500K)",

  // Alpha 12W Downlight for Junction Box (4 inch Cutout)
  "DD51227": "Wipro Alpha 12W Downlight for Junction Box, Warm White (2700K), 4 inch Cutout",
  "DD51240": "Wipro Alpha 12W Downlight for Junction Box, Neutral White (4000K), 4 inch Cutout",
  "DD51265": "Wipro Alpha 12W Downlight for Junction Box, Cool Day White (6500K), 4 inch Cutout",

  // Alpha 12W Round Downlight for Junction Box (Glare-Free)
  "DD61227": "Wipro Alpha 12W Round Downlight for Junction Box, Warm White (2700K), Glare-Free",
  "DD61240": "Wipro Alpha 12W Round Downlight for Junction Box, Neutral White (4000K), Glare-Free",
  "DD61265": "Wipro Alpha 12W Round Downlight for Junction Box, Cool Day White (6500K), Glare-Free",

  // Emergency batten
  "DE12065": "Wipro Garnet 20W Emergency LED Batten",

  // Strip / rope lights
  "DF12810": "Wipro 18 Meter Tricolor IP65 Rope Light with 60 LED/mtr, Waterproof Flexible",
  "DF15000": "Wipro 5 Meter LED Strip Lights, Waterproof, Bright RGB Color Changing, 24 Keys Remote",
  "DF25000": "Wipro 10 Meter LED Strip Lights, Waterproof, Bright RGB Color Changing",
  "DF35000": "Wipro 20 Meter LED Strip Lights, Waterproof, Bright RGB Color Changing",

  // Backlit panel
  "DG24065": "Wipro Garnet 40W 2x2 Backlit LED Recess Panel, Cool White (Aluminium)",

  // Track lights (color inferred from 27=2700K / 40=4000K numbering pattern)
  "DH52027": "Wipro Garnet 20W Track Light, 360 Degree Rotation, Warm White (2700K), High Voltage Protection",
  "DH52040": "Wipro Garnet 20W Track Light, 360 Degree Rotation, Neutral White (4000K), High Voltage Protection",
  "DH53027": "Wipro Garnet 30W Track Light, 360 Degree Rotation, Warm White (2700K), High Voltage Protection",
  "DH53040": "Wipro Garnet 30W Track Light, 360 Degree Rotation, Neutral White (4000K), High Voltage Protection",

  // Linear under-cabinet light
  "DJ11627": "Wipro Garnet 16W Linear Under Cabinet Light, Warm White (Aluminium, 3Ft)",
  "DJ11640": "Wipro Garnet 16W Linear Under Cabinet Light, Neutral White (Aluminium, 3Ft)",
  "DJ11665": "Wipro Garnet 16W Linear Under Cabinet Light, Cool White (Aluminium, 3Ft)",

  // Garnet 22W Alpha Panel - Round
  "DJ22227": "Wipro Garnet 22W Alpha Panel, Round, Warm White",
  "DJ22240": "Wipro Garnet 22W Alpha Panel, Round, Neutral White",
  "DJ22265": "Wipro Garnet 22W Alpha Panel, Round, Cool Day White",
  // Garnet 22W Alpha Panel - Square
  "DJ32227": "Wipro Garnet 22W Alpha Panel, Square, Warm White",
  "DJ32240": "Wipro Garnet 22W Alpha Panel, Square, Neutral White",
  "DJ32265": "Wipro Garnet 22W Alpha Panel, Square, Cool Day White",

  // Garnet 8W Round LED Alpha Panel (Recessed Down Light)
  "DJ40827": "Wipro Garnet 8W Round LED Alpha Panel, Warm White (2700K), Recessed Down Light",
  "DJ40840": "Wipro Garnet 8W Round LED Alpha Panel, Neutral White (4000K), Recessed Down Light",
  "DJ40865": "Wipro Garnet 8W Round LED Alpha Panel, Cool Day White (6500K), Recessed Down Light",

  // 12W Round LED Alpha Panel
  "DJ41200": "Wipro 12W Round LED Alpha Panel, 3-in-1 Colour Changing (Cool Day/Neutral/Warm)",
  "DJ41227": "Wipro 12W Round LED Alpha Panel, Warm White (2700K), Recessed Down Light",
  "DJ41240": "Wipro 12W Round LED Alpha Panel, Neutral White (4000K), Recessed Down Light",
  "DJ41265": "Wipro 12W Round LED Alpha Panel, Cool Day White (6500K), Recessed Down Light",

  // Garnet 8W Square LED Alpha Panel (Recessed Down Light)
  "DJ50827": "Wipro Garnet 8W Square LED Alpha Panel, Warm White (2700K), Recessed Down Light",
  "DJ50840": "Wipro Garnet 8W Square LED Alpha Panel, Neutral White (4000K), Recessed Down Light",
  "DJ50865": "Wipro Garnet 8W Square LED Alpha Panel, Cool Day White (6500K), Recessed Down Light",

  // 12W Square LED Alpha Panel
  "DJ51200": "Wipro 12W Square LED Alpha Panel, 3-in-1 Colour Changing (Cool Day/Neutral/Warm)",
  "DJ51227": "Wipro Garnet 12W Square LED Alpha Panel, Warm White (2700K), Recessed Down Light",
  "DJ51240": "Wipro Garnet 12W Square LED Alpha Panel, Neutral White (4000K), Recessed Down Light",
  "DJ51265": "Wipro Garnet 12W Square LED Alpha Panel, Cool Day White (6500K), Recessed Down Light",

  // RGB strip
  "DL35000": "Wipro RGB LED Strip Light, 60 LEDs/Mtr, 24 Keys IR Remote Controlled RGB Color Changing",

  // Smart
  "DSE2150": "Wipro Next Smart Extension",
  "DSE3150": "Wipro Smart USB Extension, Voice Control with Alexa and Google Home",
  "DSP2100": "Wipro Smart Switch Module, 1 Switch Control",

  // Emergency / rechargeable / solar
  "E10004": "Wipro Coral Rechargeable Emergency Light (Yellow)",
  "E10008": "Wipro Azure LED Rechargeable Lantern",
  "E10012": "Wipro Coral Plus Rechargeable Solar LED Lantern",
  "E10013": "Wipro Re-Chargeable LED Table Lamp, White, Standard",

  // Deco / Safelite night lamps
  "N10000": "Wipro Deco 0.5W LED Bulb, Multicolour",
  "N10001": "Wipro Safelite B22 0.5W LED Night Lamp, Cool Day Light",
  "N10002": "Wipro Safelite B22 0.5W LED Night Lamp, White",
  "N10003": "Wipro Safelite B22 0.5W LED Night Lamp, Yellow",
  "N10004": "Wipro Safelite B22 0.5W LED Night Lamp, Blue",
  "N10005": "Wipro Safelite B22 0.5W LED Night Lamp, Green",
  "N10006": "Wipro Safelite B22 0.5W LED Night Lamp, Red",

  // High-wattage bulbs
  "N30101-1": "Wipro Garnet 30W LED High Wattage Bulb, Cool Day White (6500K), B22 Base",
  "N40001": "Wipro Garnet 40W LED High Wattage Bulb, Cool White",
  "N50201": "Wipro Garnet 50W LED High Wattage Bulb, Cool White",

  // Emergency / inverter bulbs
  "NE1101": "Wipro Garnet 11W LED Emergency Bulb, Cool Day White (6500K), B22",
  "NE1201": "Wipro Garnet 12W LED Emergency Bulb, B22 (White)",
  "NE1401": "Wipro Garnet 14W LED Emergency Bulb, Cool Day White (6500K), B22",
  "NE1501": "Wipro Garnet 15W Rechargeable Emergency Inverter LED Bulb, Cool White",
  "NE2001": "Wipro Garnet 20W Emergency Bulb",
  "NE2501": "Wipro Garnet 25W Emergency Bulb",
  "NE3001": "Wipro Garnet 30W Emergency Bulb",
  "NE9001": "Wipro Garnet 9W B22 LED Emergency Bulb (White)",

  // Smart bulbs
  "NS9600": "Wipro 9W Bluetooth Enabled Smart Bulb B22, 16 Million Colours, White Tunable",
  "NS9700": "Wipro 9W Bluetooth Enabled Smart Bulb E27, 16 Million Colours, White Tunable",

  // Smart batten
  "SB21240": "Wipro Next Smart Wi-Fi 24W CCT LED Batten, Dimmable, Schedulable",

  // Power units / motor starters / MCBs (Northwest)
  "NW-PU3MBT0000": "Wipro Northwest 3 Module Surface Mounted Power Unit with Single Pole MCB & 16A",
  "NW-ACPU6MBT00": "Wipro Northwest 6 Module Surface Mounted Power Unit with Single Pole MCB & 16A",
  "NW-ACPU4MBT00": "Wipro Northwest 4 Module ACPU Flush Type Surface Mounted Power Unit with 16A Heavy Duty",
  "NW-C12M01H000": "Wipro Northwest H Type Motor Starters 11-18 Amp",
  "NW-C12M01J000": "Wipro Northwest J Type Motor Starters 16-25 Amp",
  "NWCTT16ASP000": "Wipro Northwest Tiny Trip Miniature MCBs 16A SP",
  "NWCTT32ADP000": "Wipro Northwest Tiny Trip Miniature MCBs 32A DP",
  "NWCTT6ASP0000": "Wipro Northwest Tiny Trip Miniature MCBs 6A SP",

  // Avancee distribution boards
  "NW-AV04WSPNDD": "Wipro Avancee 4 Way SPN Distribution Board",
  "NW-AV04WTPNDD": "Wipro Avancee 4 Way TPN Distribution Board (4-12)",
  "NW-AV04WTPNDDECO": "Wipro Avancee 4 Way TPN Distribution Board (8-12)",
  "NW-AV06WSPNDD": "Wipro Avancee 6 Way SPN Distribution Board",
  "NW-AV06WTPNDD": "Wipro Avancee 6 Way TPN Distribution Board (8-18)",
  "NW-AV08WSPNDD": "Wipro Avancee 8 Way SPN Distribution Board",
  "NW-AV08WTPNDD": "Wipro Avancee 8 Way TPN Distribution Board (8-24)",
  "NW-AV12WSPNDD": "Wipro Avancee 12 Way SPN Distribution Board",
  "NW-AV12WTPNDD": "Wipro Avancee 12 Way TPN Distribution Board (8-36)",
  "NW-AV16WSPNDD": "Wipro Avancee 16 Way SPN Distribution Board",

  // Extension boards / flex boxes
  "NWE0300": "Wipro Extension Board with 4 Universal Sockets, Grey & White",
  "NWE0400": "Wipro Flex Box with Universal Socket and 4 meter long cord, White",
  "NWE0500": "Wipro Essential 4+1 Extension",
  "NWE0600": "Wipro Optima USB Extension",
  "NWE0800": "Wipro Essential 4+4 Extension",
  "NWE0900": "Wipro Extension Board with USB Port Type A & C, 3 International Sockets",
  "NWE1000": "Wipro UFO 6+1 Flex Box",
  "NWE1100": "Wipro North West Flex Box Extension Cord with 2 Universal 3 Pin Sockets",
  "NWE1200": "Wipro North West 4+4 Extension Cord with 2 mtr Cord, Black Finish",

  // Multiplugs
  "NWM0100": "Wipro Multiplug with Universal Socket",
  "NWM0200": "Wipro 4 Way Multiplug with Two Universal Sockets",
  "NWM0300": "Wipro 3 Way Multiplug with Two Universal Sockets",
  "NWM0400": "Wipro North West Universal Multi Country Adapter with 2 USB Ports",
  "NWM0500": "Wipro 3 Way Multiplug Adaptor with 3 Universal Sockets",

  // MCBs / isolators / RCCB
  "WEN32ADP": "Wipro Enshield 32A DP Box Type MCB",
  "WM6ASPC": "Wipro MCB 6A SPC",
  "WM6ATP": "Wipro MCB 6A TP C Curve",
  "WM10ASPC": "Wipro MCB 10A SPC",
  "WM10ATP": "Wipro MCB 10A TP C Curve",
  "WM16ADP": "Wipro MCB 16A DP",
  "WM16ASPC": "Wipro MCB 16A SPC",
  "WM16ATP": "Wipro MCB 16A TP C Curve",
  "WM20ASPC": "Wipro MCB 20A SPC",
  "WM20ATP": "Wipro MCB 20A TP C Curve",
  "WM25ADP": "Wipro MCB 25A DP C Curve",
  "WM25ASPC": "Wipro MCB 25A SPC",
  "WM25ATP": "Wipro MCB 25A TP C Curve",
  "WM32ADP": "Wipro MCB 32A DP",
  "WM32ASPC": "Wipro MCB 32A SPC",
  "WM32ATP": "Wipro MCB 32A TP C Curve",
  "WM40ASPC": "Wipro MCB 40A SPC",
  "WM40ATP": "Wipro MCB 40A TP C Curve",
  "WM63ASPC": "Wipro MCB 63A SPC",
  "WM63ATP": "Wipro MCB 63A TP C Curve",
  "WMISO40ADP": "Wipro Isolator 40A DP",
  "WMISO40AFP": "Wipro Isolator 40A FP",
  "WMISO63ADP": "Wipro Isolator 63A DP",
  "WMISO63AFP": "Wipro Isolator 63A FP",
  "WR30M40AFP": "Wipro RCCB 30mA 40A FP",
  "WR30M63AFP": "Wipro RCCB 30mA 63A FP",
  "WR100M40AFP": "Wipro RCCB 100mA 40A FP",
  "WR100M63AFP": "Wipro RCCB 100mA 63A FP",
};

function envVal(t, k) { const m = t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`, "mi")); return m ? m[1].trim() : undefined; }

async function main() {
  const env = await readFile(".env.local", "utf8");
  const client = new MongoClient(envVal(env, "MONGODB_URI"), { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const col = client.db(envVal(env, "MONGODB_DB") || "inventory").collection("app");
  const store = (await col.findOne({ _id: "store" })).data;
  await writeFile("import-backup-wipro-desc.json", JSON.stringify(store));

  const byEan = new Map();
  for (const p of store.products) if (p.channel === CHANNEL) byEan.set(p.ean, p);

  let updated = 0;
  const missing = [];
  for (const [sku, name] of Object.entries(NAMES)) {
    const p = byEan.get(sku);
    if (!p) { missing.push(sku); continue; }
    p.name = name;
    updated++;
  }

  // Which Wipro masters did NOT get a name from this sheet?
  const stillDefault = store.products
    .filter((p) => p.channel === CHANNEL && /wipro/i.test(p.brand || "") && (!p.name || /^Wipro\s+[A-Z0-9-]+$/.test(p.name)))
    .map((p) => p.ean);

  await col.replaceOne({ _id: "store" }, { data: store }, { upsert: true });
  console.log(`✓ Wipro descriptions applied. names updated: ${updated} / ${Object.keys(NAMES).length}`);
  if (missing.length) console.log(`  SKUs in map but not found in DB (${missing.length}): ${missing.join(", ")}`);
  console.log(`  Wipro masters still without a real name (${stillDefault.length}): ${stillDefault.join(", ") || "none"}`);
  await client.close();
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
