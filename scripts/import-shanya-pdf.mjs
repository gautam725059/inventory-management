// Import the Shanya master product list (name + EAN, no packs) into the catalog
// via the real import API. Run with the dev server up:
//   node scripts/import-shanya-pdf.mjs
// Data transcribed from the user's "Untitled spreadsheet - Sheet1.pdf" (text PDF).

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// [name, ean]
const PRODUCTS = [
  ["Shanya Floral Bunny Kitchen Apron (Polyester)", "8906199313261"],
  ["Shanya Floral Bunny Kitchen Apron (Polyester)", "8906199313278"],
  ["Shanya Mesh Tea Infuser Strainer (Stainless Steel)", "8906199313094"],
  ["Shanya Garbage Bag (Medium)", "8906199313100"],
  ["Welcome Baby Girl Decoration Kit by Shanya", "8906199313131"],
  ["Welcome Baby Boy Decoration Kit by Shanya", "8906199313124"],
  ["Happy Anniversary Foil Balloon Banner by Shanya", "8906199313148"],
  ["Shanya Air Fryer Liner (Silicone)", "8906199313117"],
  ["Rose Gold Birthday Girl Crown & Sash by Shanya", "8906199313087"],
  ["Glitter Tiara with Satin Sash by Shanya", "8906199313070"],
  ["Birthday Girl Glitter Sash & Tiara Crown by Shanya", "8906199313063"],
  ["Shanya Bracelets & Earrings Set (Golden, Silver)", "8906199313025"],
  ["Shanya Heart Drop Pendant with Chain (Golden)", "8906199313049"],
  ["Shanya Elegant Heart Pendant with Chain (Golden)", "8906199313032"],
  ["Shanya Heart Charm Contemporary Necklace (Golden)", "8906199313056"],
  ["Shanya Rain Suit (Black)", "8906199313001"],
  ["Shanya Metallic Evil Eye Charm Key Chain", "8906199312936"],
  ["Shanya Rain Suit (Blue)", "8906199313018"],
  ["Shanya Elephant Evil Eye Key Chain", "8906199312929"],
  ["Shanya Dream Catcher Evil Eye Key Chain", "8906199312943"],
  ["Shanya Evil Eye Peacock Key Chain", "8906199312950"],
  ["Shanya Turtle Evil Eye Key Chain", "8906199312967"],
  ["Shanya Evil Eye Owl Key Chain", "8906199312974"],
  ["Shanya Stainless Steel Blue Handle Spoon Set", "8906199312998"],
  ["Shanya Stainless Steel Marble Style Fork Set", "8906199312981"],
  ["Shanya Flexible Hair Claw Clip (Cream, Beige, Brown, Black)", "8906199312905"],
  ["Shanya Self Adhesive Wall Hooks (Stainless Steel, Matte Black)", "8906199312899"],
  ["Shanya Engraved Bronze Bell Key Chain with Evil Eye", "8906199312875"],
  ["Shanya Silver Metal Bell Key Chain with Evil Eye Charm", "8906199312868"],
  ["Birthday Pearl Butterfly Crown Tiara by Shanya", "8906199312882"],
  ["Shanya Plastic Key Chain with Label Window", "8906199312691"],
  ["Shanya Plastic Key Chain with Label Window", "8906199312684"],
  ["Shanya Transparent Self-Adhesive Wall Hooks", "8906199312592"],
  ["Shanya Transparent Self-Adhesive Wall Hooks", "8906199312585"],
  ["Shanya Self-Adhesive Wall Hooks", "8906199312578"],
  ["Shanya Claw Clip (Beige, Brown, Taupe, Black)", "8906199312615"],
  ["Shanya Smart Rolling Ball Pet Toy with Rope (Red)", "8906199312561"],
  ["Shanya Windproof Umbrella (Maroon)", "8906199312424"],
  ["Shanya 3-Fold Windproof Compact Umbrella (Blue)", "8906199312400"],
  ["Shanya 3 Fold Windproof Compact Umbrella (Green)", "8906199312417"],
  ["Shanya Large Matte Hair Claw Clip (Olive Green, Espresso Brown, Ivory Beige, and Matte Black)", "8906199312462"],
  ["Shanya Star Self-Adhesive Wall Hooks (Acrylic, Transparent)", "8906199312387"],
  ["Shanya Matte Finish Self Adhesive Wall Hooks", "8906199312240"],
  ["Welcome Baby Girl Decoration Kit by Shanya", "21633861"],
  ["Shanya Claw Clip Set (Ivory, Taupe Beige, Mocha Brown, Matte Black)", "8906199312455"],
  ["Shanya Penguin Toothbrush Holder (Plastic, Multicolour)", "8906199312226"],
  ["Shanya Premium Silver Self-Adhesive Wall Hooks", "8906199312257"],
  ["Shanya Premium Self-Adhesive Wall Hooks", "21633907"],
  ["Lord Ganesha Evil Eye Wall Hanging (Blue) - Shanya", "8906199312295"],
  ["Shanya Shell Design Self-Adhesive Wall Hooks (Acrylic, Transparent)", "8906199312394"],
  ["Bright Owl Evil-Eye Wall Hanging (Blue) - Shanya", "8906199312288"],
  ["Elegant Owl & Evil-Eye Wall Hanging (Blue) - Shanya", "8906199312271"],
  ["Wooden Elephant Hamza Evil-Eye Wall Hanging (Green & Blue) - Shanya", "8906199312264"],
  ["Shanya Soap & Toothbrush Holder Set (Plastic, White)", "8906199312233"],
  ["Shanya Heavy Duty Self-Adhesive Wall Hooks", "21633884"],
  ["Shanya Royal Mosaic Foil Work Shagun Envelope", "8906199312189"],
  ["Shanya Plastic Airtight Container", "8906199312097"],
  ["Shanya Matte Daisy Hair Claw Clip (Multicolor)", "8906199311946"],
  ["Shanya Small Butterfly Claw Clip (Multicolour)", "8906199312134"],
  ["Shanya Elastic Hair Ties (Pastel)", "8906199312073"],
  ["Shanya Embellished Metal Claw Clip (Multicolour)", "8906199312141"],
  ["Shanya Daisy Style Claw Clip (Multicolour)", "8906199311953"],
  ["Shanya Royal Elephant with Foil Money Envelope", "8906199312172"],
  ["Shanya Waterproof Wall Hooks (Stainless Steel, Silver)", "8906199312103"],
  ["Shanya Plastic 4-Section Airtight Storage Container", "8906199311939"],
  ["Shanya Matte Banana Hair Clip (Coffee, Beige, Taupe, Black)", "8906199312127"],
  ["Shanya Pastel Marble Mini Claw Clip Set (Multicolour)", "8906199312110"],
  ["Shanya Elephant Tree Foil Shagun Envelope", "8906199312028"],
  ["Shanya Flower & Bow Cute Hair Ties Set (Brown)", "8906199311984"],
  ["Shanya Premium Elephant Print Envelope", "8906199311991"],
  ["Shanya Premium Peacock Print Envelope", "8906199312011"],
  ["Shanya Marble Texture Claw Clip Set (Colour May Vary)", "8906199312004"],
  ["Shanya Bear Toothbrush Holder (Plastic, Multicolour)", "8906199311977"],
  ["Shanya Soft Matte Hair Clip Set (Multicolour)", "8906199311960"],
  ["Shanya Plastic Oil Dispenser", "8906199311755"],
  ["Shanya Soft Elastic Hair Ties (Multicolor)", "8906199311847"],
  ["Welcome Baby Boy Decoration Kit by Shanya", "8906199311854"],
  ["Welcome Baby Girl Decoration Kit by Shanya", "8906199311830"],
  ["Birthday Girl Sash & Crown by Shanya", "8906199311823"],
  ["Shanya Modern Soap Case with Lid (Plastic, Multicolor)", "8906199311748"],
  ["Shanya Soft Duster Ball (Microfiber, Grey & White)", "8906199311731"],
  ["Shanya Self Adhesive Handle (Plastic, Multicolour)", "8906199311724"],
  ["Shanya No Drill Towel Rack (Stainless Steel, White)", "8906199311779"],
  ["Shanya Double Towel Rack (Stainless Steel, White)", "8906199311762"],
  ["Shanya Adhesive Bathroom Shelf (Plastic, White)", "8906199311694"],
  ["Shanya Multipurpose Kitchen Brush (Plastic, Purple)", "8906199311687"],
  ["Shanya Rotating Ceiling / Wall Hooks (Plastic, Black)", "8906199311717"],
  ["Shanya Shinchan Face Changing Cartoon Key Chain", "8906199311700"],
  ["Shanya Wall Mounted Bathroom Shelf (Plastic, white)", "8906199311670"],
  ["Shanya Self Adhesive Bathroom Shelf (Plastic, White)", "8906199311663"],
  ["Shanya Leather Cleaning Wipes (Cotton)", "8906199311557"],
  ["Shanya Leather Cleaning Wipes (Cotton)", "8906199311540"],
  ["Shanya Self Adhesive Wall Hooks (PVC, Transparent)", "8906199310321"],
  ["Shanya Self Adhesive Wall Hooks (PVC, Transparent)", "8906199310338"],
  ["Shanya Self Adhesive Wall Hooks (PVC, Transparent)", "8906199311465"],
  ["Shanya Glass Spray Oil Dispenser Bottle", "8906199311489"],
  ["Shanya Key Chain (Golden)", "8906199311472"],
  ["Shanya Pearl & Crystal Floral Hair Pin (Pink & White)", "8906199311410"],
  ["Shanya Pearl & Crystal Leaf Hair Pin (White)", "8906199311434"],
  ["Shanya Jasmin Artificial Gajra (White)", "8906199310369"],
  ["Shanya Mini Claw Clip Set (Colour May Vary)", "8906199310352"],
  ["Shanya Long Straight Ponytail Hair Extensions (Black)", "8906199311380"],
  ["Shanya Straight Ponytail Hair Extensions (Brown)", "8906199311373"],
  ["Shanya Pearl & Crystal Floral Hair Pin (White & Red)", "8906199311427"],
  ["Shanya Curly Frill Bun Hair Extensions (Brown)", "8906199311403"],
  ["Shanya Curly Frill Bun Hair Extensions (Black)", "8906199311397"],
  ["Shanya Clip-In Streaks Hair Extensions (Rose Gold)", "8906199311236"],
  ["Shanya Synthetic Clip-In Hair Extensions (Rose Pink)", "8906199311243"],
  ["Shanya Clip-In Hair Extensions (Purple)", "8906199311250"],
  ["Shanya Clip In Hair Extensions (Baby Pink)", "8906199311274"],
  ["Shanya Hair Extensions (Gold)", "8906199311281"],
  ["Shanya Transparent Self-Adhesive Wall Hooks", "8906199311212"],
  ["Shanya Self Adhesive Wall Hooks", "8906199311205"],
  ["Shanya Heavy Duty Adhesive Wall Hooks", "8906199311229"],
  ["Shanya 5 Clip-In Straight Hair Extensions (Natural Black)", "8906199311137"],
  ["Shanya Clip-In Curly Hair Extensions (Natural Dark Brown)", "8906199311106"],
  ["Shanya Clip-In Curly Hair Extensions (Natural Black)", "8906199311113"],
  ["Shanya Clip-In Straight Hair Extensions (Natural Dark Brown)", "8906199311120"],
  ["Shanya Hair Bun Scrunchie (Brown)", "8906199311090"],
  ["Pink Glitter Cursive Happy Birthday Banner by Shanya", "8906199311083"],
  ["Silver Glitter Cursive Happy Birthday Banner by Shanya", "8906199311076"],
  ["Blue Glitter Cursive Happy Birthday Banner by Shanya", "8906199311069"],
  ["Rose Gold Glitter Cursive Happy Birthday Banner by Shanya", "8906199311052"],
  ["Shanya Premium Red Kitchen Knife Set (Stainless Steel)", "8906199310635"],
  ["Golden Shinning Happy Birthday Banner by Shanya", "8906199311038"],
  ["Shanya Green Knife Set with Covers (Stainless Steel)", "8906199310642"],
  ["Shanya Premium Printed Blue Knife Set (Stainless Steel)", "8906199310628"],
  ["Shanya Printed Kitchen Knife Set (Stainless Steel)", "8906199310659"],
  ["Happy Birthday Banner Shanya", "8906199311014"],
  ["Happy Birthday Banner (Black & Gold) by Shanya", "8906199311007"],
  ["Happy Birthday Banner - Shanya", "8906199311021"],
  ["Happy Birthday Banner by Shanya", "8906199310994"],
  ["Welcome Baby Boy Foil Balloons Decoration Kit by Shanya", "8906199310987"],
  ["Welcome Baby Girl Foil Balloon Decoration Kit by Shanya", "8906199310970"],
  ["Birthday Girl Sash & Headband Set by Shanya", "8906199310949"],
  ["Butterfly Happy Birthday Banner by Shanya", "8906199310932"],
  ["Mermaid Theme Happy Birthday Banner by Shanya", "8906199310925"],
  ["Unicorn Theme Happy Birthday Banner by Shanya", "8906199310918"],
  ["Shanya Hair Bun Scrunchie (Black)", "8906199310901"],
  ["Happy Birthday Foil Balloons (Polka Hearts) by Shanya", "8906199310826"],
  ["Shanya Mini Flower Hair Claw Clip Set (Colour May Vary)", "8906199310819"],
  ["Shanya Floral Claw Clip (Colour May Vary)", "8906199310567"],
  ["Shanya Flower Design with Rhinestones Claw Clip (Assorted)", "8906199310796"],
  ["Shanya Matte Finish Arch Claw Clip (Multicolour)", "8906199310581"],
  ["Shanya Claw Clip (Multicolour)", "8906199310703"],
  ["Shanya Floral Claw Clip (Multicolour)", "8906199310697"],
  ["Shanya Crystal Shaped Adhesive Wall Hooks", "8906199310727"],
  ["Shanya Self-Adhesive Wall Hooks Transparent", "8906199310611"],
  ["Shanya Knife Set (Stainless Steel)", "8906199310604"],
  ["Shanya Scented Artificial Gajra Set (White & Red)", "8906199310390"],
  ["Shanya Premium Matte Mini Claw Clip (Colour May Vary)", "8906199310345"],
  ["Shanya Hair Claw Clip - Pack of 8 (Multicolour)", "8906199310284"],
  ["Shanya Wave Design Hair Claw Clip (Multicolour)", "8906199310277"],
  ["Shanya Matte Finish Hair Claw Clip (Multicolour)", "8906199310291"],
  ["Shanya Bow Tie Design Claw Clip (Multicolour)", "8906199310253"],
  ["Shanya Matte Finish Premium Claw Clip (Multicolour)", "8906199310239"],
  ["Shanya Flower Leaf Claw Clip (Multicolour)", "8906199310246"],
  ["Shanya Flower Claw Clip (Multicolour)", "8906199310260"],
  ["Shanya Shoe Cleaning Wipes", "8906199310192"],
  ["Shanya Shoe Cleaning Wipes", "8906199310178"],
  ["Shanya Soap Dispenser with Hand Wash & Scrub Holder (Plastic)", "8906199310208"],
  ["Shanya Multi-Functional Floor Wiper", "8906199310215"],
  ["Shanya Analog Wall Clock (White)", "8906199310185"],
  ["Shanya Self-Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)", "8906199310123"],
  ["Shanya Adhesive Wall Hooks (Stainless Steel, Transparent)", "8906199310017"],
  ["Shanya Anti-Skid Baking Mat (Silicone)", "8906199310130"],
  ["Shanya Classic 2-Fold Manual Button Umbrella (Black)", "8906199310116"],
  ["Shanya Nylon Cloth Rope with Clips (Multicolour)", "8906199310093"],
  ["Shanya 3-Fold Windproof Compact Umbrella (Black)", "8906199310109"],
  ["Shanya Self Adhesive Wall Hooks (Stainless Steel, PVC, Transparent)", "8906199310079"],
  ["Shanya Ice Tray Set (Silicone)", "8906199310055"],
  ["Shanya Ice Tray (Silicone)", "8906199310031"],
  ["Shanya Adhesive Wall Hooks Transparent (Stainless Steel, Transparent)", "8906199310000"],
];

function buildText() {
  // Importer columns: col0 Date | col1 Master name | col2 Master EAN
  return PRODUCTS.map(([name, ean]) => ["", name, ean].join("\t")).join("\n");
}

async function main() {
  // Duplicate-EAN sanity check (would collapse into one product on import).
  const seen = new Map();
  const dupes = [];
  for (const [name, ean] of PRODUCTS) {
    if (seen.has(ean)) dupes.push(`${ean}: "${seen.get(ean)}" / "${name}"`);
    else seen.set(ean, name);
  }
  console.log(`Rows: ${PRODUCTS.length} | unique EANs: ${seen.size}`);
  if (dupes.length) console.log("DUPLICATE EANs:\n  " + dupes.join("\n  "));

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin", password: ADMIN_PASSWORD }),
  });
  if (!login.ok) {
    console.error("Login failed:", login.status, await login.text());
    process.exit(1);
  }
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const text = buildText();

  const preview = await fetch(`${BASE}/api/admin/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ text, preview: true }),
  }).then((r) => r.json());
  console.log("PREVIEW:", JSON.stringify(preview.summary));

  const imported = await fetch(`${BASE}/api/admin/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ text, preview: false }),
  }).then((r) => r.json());
  console.log("IMPORT RESULT:", JSON.stringify(imported.result));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
