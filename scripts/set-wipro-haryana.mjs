// Replace the B2B Haryana warehouse inventory with the Wipro inventory PDF.
// Clears all current Haryana(B2B) stock, then sets each SKU to its PDF units.
//   node scripts/set-wipro-haryana.mjs
const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const WH = "wh-delhi-b2b"; // Haryana Warehouse (B2B)

// [SKU, units] from wpro-inventory.pdf
const TARGET = [
  ["E10004", 1620], ["NE1201", 1440], ["DD51265", 1340], ["NE9011", 1280],
  ["NE1501", 1060], ["DD61240", 1000], ["NS9600", 970], ["E10016", 958],
  ["N10002", 780], ["NS9400", 630], ["D520627", 600], ["D520827", 600],
  ["N10001", 480], ["DD61265", 460], ["E10008", 408], ["E10017", 336],
  ["D562065", 300], ["NE9001", 300], ["D520885", 297], ["NS9700", 265],
  ["DJ41200", 260], ["D520640", 250], ["NE1401", 240], ["NE2001", 240],
  ["NE2501", 220], ["D520895", 200], ["NE1101", 200], ["NWM0200", 200],
  ["WEN32ADP", 175], ["D520665", 161], ["D54265", 160], ["DJ40840", 160],
  ["D740227", 150], ["D521265", 140], ["D532065", 120], ["E10013", 120],
  ["N10004", 120], ["NWM0100", 120], ["D520727", 100], ["D521027", 100],
  ["D532200", 100], ["DJ51200", 100], ["NWE0400", 100], ["N30101", 90],
  ["E10012", 84], ["CL0009", 80], ["D520685", 66], ["D520695", 60],
  ["D520800", 60], ["D542565", 60], ["N10003", 60], ["NS1220", 60],
  ["D320627", 50], ["D520840", 50], ["D521080", 50], ["D521085", 50],
  ["D521090", 50], ["DD61227", 50], ["D542065", 40], ["DJ40827", 40],
  ["D320365", 30], ["D320665", 30], ["D320940", 30], ["D740265", 30],
  ["D740285", 30], ["CLL0011", 20], ["D320965", 20], ["D521240", 20],
  ["DD51227", 20], ["DE12065", 20], ["DJ11665", 20], ["DJ40865", 20],
  ["DJ51265", 20], ["DSC2150", 20], ["N50201", 18], ["CL0005", 16],
  ["N40001", 16], ["WR100M63AFP", 16], ["CL0007", 12], ["DJ22265", 10],
  ["DJ32265", 10], ["D350327", 7], ["DF12810", 1],
];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "admin", password: ADMIN_PASSWORD }),
});
const cookie = login.headers.get("set-cookie").split(";")[0];
const H = { "Content-Type": "application/json", cookie };

// 1) Clear all current Haryana (B2B) stock lines.
const detail = await fetch(`${BASE}/api/warehouses/${WH}`, { headers: { cookie } }).then((r) => r.json());
let cleared = 0;
for (const line of detail.lines ?? []) {
  const res = await fetch(`${BASE}/api/warehouses/${WH}/stock/${encodeURIComponent(line.ean)}`, {
    method: "DELETE",
    headers: { cookie },
  });
  if (res.ok) cleared++;
}
console.log(`Cleared ${cleared} existing stock lines in Haryana (B2B).`);

// 2) Receive each PDF SKU's units (creates the 13 missing products, named "Wipro <SKU>").
const date = today();
let ok = 0;
const fails = [];
for (const [sku, units] of TARGET) {
  const res = await fetch(`${BASE}/api/warehouses/${WH}/receive`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      ean: sku,
      quantity: units,
      name: `Wipro ${sku}`,
      vendorName: "Opening Stock",
      bill: `OPENING-${date}`,
      date,
    }),
  });
  if (res.ok) ok++;
  else fails.push(`${sku}: ${(await res.json().catch(() => ({}))).error || res.status}`);
}
console.log(`Set stock for ${ok}/${TARGET.length} SKUs.`);
if (fails.length) console.log("FAILED:\n  " + fails.join("\n  "));
