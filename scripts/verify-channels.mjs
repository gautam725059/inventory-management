// Quick check: how many items each channel returns for catalog / PO / RO.
const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "admin", password: ADMIN_PASSWORD }),
});
const authCookie = login.headers.get("set-cookie").split(";")[0];

async function get(path, channel) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie: `${authCookie}; channel=${channel}` },
  });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

for (const ch of ["ecom", "b2b"]) {
  const products = await get("/api/products", ch);
  const pos = await get("/api/purchase-orders", ch);
  const ros = await get("/api/release-orders", ch);
  const vendors = await get("/api/vendors", ch);
  const customers = await get("/api/customers", ch);
  console.log(
    `${ch.toUpperCase().padEnd(4)} | products: ${products.length} | POs: ${pos.length} | ROs: ${ros.length} | vendors: ${vendors.length} | customers: ${customers.length}`
  );
}
