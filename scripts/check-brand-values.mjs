// Inspect B2B catalog: which products have stock + price, and brand value totals.
const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "admin", password: ADMIN_PASSWORD }),
});
const authCookie = login.headers.get("set-cookie").split(";")[0];

const products = await fetch(`${BASE}/api/products`, {
  headers: { cookie: `${authCookie}; channel=b2b` },
}).then((r) => r.json());

const withStock = products.filter((p) => p.totalQuantity > 0);
console.log(`B2B products: ${products.length} | with stock>0: ${withStock.length}`);

// Show up to 10 stocked products with their prices.
for (const p of withStock.slice(0, 10)) {
  console.log(
    `  ${p.ean} | brand=${p.brand ?? "-"} | qty=${p.totalQuantity} | sell=${p.sellingPrice ?? "-"} | purch=${p.purchasePrice ?? "-"}`
  );
}

// Brand value totals (selling || purchase fallback).
const brands = {};
for (const p of products) {
  const b = p.brand || "(none)";
  const price = p.sellingPrice ?? p.purchasePrice ?? 0;
  brands[b] = brands[b] || { count: 0, qty: 0, value: 0 };
  brands[b].count++;
  brands[b].qty += p.totalQuantity;
  brands[b].value += p.totalQuantity * price;
}
console.log("Brand totals:");
for (const [b, t] of Object.entries(brands)) {
  console.log(`  ${b}: ${t.count} products, ${t.qty} pcs, value ₹${t.value}`);
}
