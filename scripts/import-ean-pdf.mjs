// One-off: load the products from ean.pdf into the catalog via the real import
// API (so it works on whatever backend the app is using). Run with the dev
// server up:  node scripts/import-ean-pdf.mjs
//
// Each entry: [name, masterEan, [packSizes...]]. Pack sizes come from the
// "P10/P15/P20"-style pack rows; the parser stores them as combo sizes.

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const PRODUCTS = [
  // ---- Page 1 ----
  ["J HOOK (Flower J Hook)", "8906199313155", [10, 15, 20]],
  ["Big J Hook Silver", "8906199313162", [10]],
  ["Big J Hook Golden", "8906199313186", [10]],
  ["Frame Hook", "8906199313193", [10, 15, 20]], // incl. Frame Hook Long P10/15/20
  ["Nut Hook", "8906199313216", [10, 15, 20]],
  ["369 Rotating Hook", "8906199313223", [5]],
  ["Star Hook", "8906199313230", [5]],
  ["Shell Hook P1", "8906199313247", [5]],
  ["6PC Transparent Hook", "8906199313254", [2]],
  ["6PC Silver Hook", "8906199313285", [2]],
  ["6PC Green Hook", "8906199313292", [2]],
  ["Matte Black U Hook", "8906199313353", [5]],
  ["Matte Silver U Hook", "8906199313360", [5]],
  ["Matte Silver Hook", "8906199313377", [2, 4]],
  ["Matte Black Hook", "8906199313384", [2, 4]],
  ["Crystal Hook", "8906199313407", [10, 15, 20]],
  ["U Transparent Hook", "8906199313414", [10, 15, 20]],
  // ---- Page 2 ----
  ["S Transparent Hook", "8906199313421", [10, 15, 20]],
  ["Cloth Rope", "8906199313438", [2]],
  ["Bathroom Shelf Black & White", "8906199313445", [2]], // White P1/P2
  ["Bathroom Towel Rod Single", "8906199311779", []],
  ["Bathroom Towel Rod Double P1", "8906199311762", []],
  ["Knife Set - Black", "8906199310604", []],
  ["Knife Set - Purple", "8906199310659", []],
  ["Knife Set - Blue", "8906199310628", []],
  ["Knife Set - Green", "8906199310642", []],
  ["Knife Set - Red", "8906199310635", []],
  ["Plastic Oil Dispenser", "8906199313452", [2]],
  ["Silicone Baking Mat", "8906199313469", [2]],
  ["Shoe Cleaning Wipes", "8906199313483", [2]], // P1/P2
  ["Ice Cube Tray Hexagonal", "8906199313490", [2]],
  ["Ice Cube Tray Circle", "8906199313506", [2]],
  ["Evil Eye Key Chain - Tree", "8906199312936", []],
  ["Evil Eye Key Chain - Elephant", "8906199312929", []],
  ["Evil Eye Key Chain - Dream Catcher", "8906199312943", []],
  ["Evil Eye Key Chain - Peacock", "8906199312950", []],
  ["Evil Eye Key Chain - Turtle", "8906199312967", []],
  ["Evil Eye Key Chain - Owl", "8906199312974", []],
  ["Gaurdian Bell - Bronze", "8906199312875", []],
  ["Gaurdian Bell - Silver", "8906199312868", []],
  ["Face Changing Key Chain", "8906199311700", []],
  ["Butterfly Crown", "8906199312882", []],
  ["Welcome Baby Boy - Foot", "8906199311854", []],
  ["Welcome Baby Girl - Foot", "8906199311830", []],
  // ---- Page 3 ----
  ["Welcome Baby Boy - Baby", "8906199310987", []],
  ["Welcome Baby Girl - Baby", "21633861", []],
  ["Welcome Baby Girl - Baby", "8906199310970", []],
];

// Build TSV in the importer's column layout:
//   col0 Date | col1 Master name | col2 Master EAN | col3 Pack code | col4 Pack EAN
// Master row: name + ean. Pack rows: a "<name> P<size>" code, no pack EAN ->
// the parser keeps the size as a combo size.
function buildText() {
  const rows = [];
  for (const [name, ean, sizes] of PRODUCTS) {
    rows.push(["", name, ean].join("\t"));
    for (const s of sizes) {
      rows.push(["", "", "", `${name} P${s}`].join("\t"));
    }
  }
  return rows.join("\n");
}

async function main() {
  // 1. Log in as admin to get the session cookie.
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin", password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error("Login failed:", loginRes.status, await loginRes.text());
    process.exit(1);
  }
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) {
    console.error("No session cookie returned.");
    process.exit(1);
  }

  const text = buildText();

  // 2. Preview first (sanity), then import.
  const preview = await fetch(`${BASE}/api/admin/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ text, preview: true }),
  }).then((r) => r.json());
  console.log("PREVIEW:", JSON.stringify(preview.summary, null, 2));

  const imported = await fetch(`${BASE}/api/admin/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ text, preview: false }),
  }).then((r) => r.json());
  console.log("IMPORT RESULT:", JSON.stringify(imported.result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
