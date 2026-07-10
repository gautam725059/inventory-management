// Built-in Guide content + a tiny offline matcher. No AI / no network: a new
// staff member types a question ("stock in kaise kare?") and searchGuides()
// ranks these curated how-tos by keyword overlap (English + Hinglish synonyms).
// Steps use the app's real button labels so the instructions never go stale
// silently — if a label changes in the UI, update it here too.

export interface GuideLink {
  label: string;
  href: string;
}

export interface Guide {
  id: string;
  title: string;
  category: "Daily" | "Orders" | "Setup" | "Account" | "Admin";
  icon: string;
  adminOnly?: boolean;
  /** Match terms — keep both English and Hinglish words a staffer might type. */
  keywords: string[];
  intro?: string;
  steps: string[];
  /** Extra callout shown below the steps (e.g. approval / permission notes). */
  note?: string;
  links?: GuideLink[];
  related?: string[];
}

export const GUIDES: Guide[] = [
  {
    id: "stock-in",
    title: "Stock In — maal andar lena (receive)",
    category: "Daily",
    icon: "📥",
    keywords: [
      "stock in", "stockin", "receive", "maal andar", "andar", "goods in",
      "add stock", "stock daalna", "stock badhana", "purchase", "kharida",
      "naya maal", "inward", "in", "receiving", "stock lena",
    ],
    intro: "Naya maal warehouse me daalne ke liye:",
    steps: [
      "Dashboard (🏠) pe apna warehouse kholo.",
      "\"Stock In\" (📥) card pe click karo.",
      "Product ka code — E-commerce me EAN/barcode, B2B me SKU — scan ya type karo. Purana product ho to naam apne-aap aa jayega.",
      "Naya product hai to naam khud likho (naya product yahin ban jayega).",
      "Quantity (kitne piece), Vendor, Bill number aur Date bharo. Purchase price optional hai.",
      "Ek se zyada product? Neeche nayi line add karke sab ek saath daalo.",
      "\"Receive … into warehouse\" button dabao — stock add ho jayega aur History me tumhare naam se dikhega.",
    ],
    note: "Stock In koi bhi (admin ya staff) direct kar sakta hai — approval ki zaroorat nahi.",
    links: [{ label: "Dashboard kholo", href: "/" }],
    related: ["stock-out", "adjust", "new-product", "history"],
  },
  {
    id: "stock-out",
    title: "Stock Out — maal bahar bhejna (dispatch)",
    category: "Daily",
    icon: "📤",
    keywords: [
      "stock out", "stockout", "dispatch", "maal bahar", "bahar bhejna", "bahar",
      "nikalna", "sell", "becha", "outward", "out", "ship",
      "delivery", "goods out", "customer ko bhejna",
    ],
    intro: "Warehouse se maal bahar (customer/order ke liye) nikalne ke liye:",
    steps: [
      "Dashboard pe apna warehouse kholo → \"Stock Out\" (📤).",
      "Upar \"Product\" tab chuna rehne do (bundle bhejna ho to \"🎁 Combo\").",
      "Code scan karo — E-commerce me EAN barcode, B2B me ASIN.",
      "Pack size aur kitne pack (packs) daalo — total piece apne-aap ban jaate hain.",
      "Date, Invoice number, aur Customer bharo (reference optional).",
      "Ek se zyada product ho to nayi line add karo — sab ek hi invoice pe.",
      "\"Dispatch … (stock out)\" dabao — stock kam ho jayega aur History me tumhare naam se log ho jayega.",
    ],
    note: "Stock Out bhi direct hota hai (approval nahi). Stock se zyada nikalne ki koshish karoge to system rok dega.",
    links: [{ label: "Dashboard kholo", href: "/" }],
    related: ["stock-in", "combo-out", "release-order", "history"],
  },
  {
    id: "combo-out",
    title: "Combo Stock Out — bundle bhejna",
    category: "Daily",
    icon: "🎁",
    keywords: [
      "combo", "bundle", "kit", "set", "combo out", "combo dispatch",
      "combo bhejna", "gift", "pack of", "combo stock out",
    ],
    intro: "Ek combo (kai products ka bundle) ek saath bhejne ke liye:",
    steps: [
      "Warehouse → \"Stock Out\" kholo.",
      "Upar \"🎁 Combo\" tab pe jao.",
      "Combo chuno (ya uska barcode scan karo).",
      "Kitne combo bhej rahe ho woh number daalo — har component ka stock utna kam hoga.",
      "Date, Invoice aur Customer bharo.",
      "\"Dispatch combo (stock out)\" dabao.",
    ],
    note: "Combo pehle banana padta hai (Combos page pe). Combo ka recipe — kaunse product kitne — wahin set hota hai.",
    links: [
      { label: "Combos page", href: "/combos" },
      { label: "Dashboard kholo", href: "/" },
    ],
    related: ["combos-manage", "stock-out"],
  },
  {
    id: "adjust",
    title: "Add / Remove Stock — correction (+/−)",
    category: "Daily",
    icon: "⚖️",
    keywords: [
      "adjust", "adjustment", "correction", "sudhar", "damage", "kharab",
      "theft", "chori", "loss", "count", "ginti", "recount", "add remove",
      "stock theek", "manual", "kam zyada", "galti sudhar", "stock kam",
      "kam karna", "ghatana", "badhana correction",
    ],
    intro: "Damage, chori, ya ginti ki galti theek karne ke liye (Stock In/Out se alag):",
    steps: [
      "Warehouse → \"Add / Remove Stock\" (⚖️) kholo.",
      "Product ka code scan/type karo — naam auto aa jayega.",
      "Direction chuno: \"Remove (−)\" ghatane ke liye, \"Add (+)\" badhane ke liye.",
      "Amount (kitne piece) daalo.",
      "Reason chuno — Damage, Count correction, Theft / Loss, Found / Recount, Other.",
      "Submit karo.",
    ],
    note: "STAFF ka adjustment seedha nahi lagta — woh admin ke paas approval me jata hai (Admin → Approvals). Admin approve karega tabhi stock badlega. Admin ka adjustment turant lag jata hai.",
    links: [{ label: "Dashboard kholo", href: "/" }],
    related: ["stock-in", "stock-out", "history"],
  },
  {
    id: "transfer",
    title: "Transfer — ek warehouse se doosre me",
    category: "Daily",
    icon: "🔁",
    adminOnly: true,
    keywords: [
      "transfer", "move", "shift", "warehouse se warehouse", "ek se doosre",
      "ek se dusre", "warehouse se dusre", "dusre warehouse", "dusre me bhejna",
      "stock move", "godown", "transfer stock", "warehouse change",
    ],
    intro: "Stock ko ek warehouse se doosre warehouse me le jaane ke liye (sirf admin):",
    steps: [
      "Jis warehouse se bhejna hai use kholo → \"Transfer\" (🔁).",
      "Product ka code (EAN/SKU) scan ya type karo — naam aur available stock dikh jayega.",
      "Destination warehouse chuno.",
      "Quantity daalo — jitna stock hai usse zyada nahi.",
      "\"Transfer stock\" dabao. Dono warehouse ki History me log hoga.",
    ],
    note: "Transfer sirf admin kar sakta hai. Dono warehouse ek hi channel ke hone chahiye (E-commerce ↔ E-commerce, B2B ↔ B2B).",
    links: [{ label: "Dashboard kholo", href: "/" }],
    related: ["stock-in", "stock-out", "history"],
  },
  {
    id: "history",
    title: "History — kisne kya kiya",
    category: "Daily",
    icon: "📜",
    keywords: [
      "history", "log", "kisne kiya", "kaun ne", "record", "movements",
      "audit", "by", "naam", "who did", "kab kiya", "purana record", "report movement",
    ],
    intro: "Kisi warehouse me sab stock-in/out/adjust/transfer kaun ne aur kab kiya, ye dekhne ke liye:",
    steps: [
      "Warehouse kholo → \"History\" (📜).",
      "Har row me Date, Type (in/out/adjust/transfer), Product, Detail, aur \"By\" (kisne kiya) dikhega.",
      "Upar search se kisi product ya type ko filter kar sakte ho.",
      "Poora record chahiye to \"Export CSV\" se download kar lo.",
    ],
    note: "\"By\" column me naam sirf naye movements pe aayega. Bahut purane records pe \"—\" dikhega (tab tak user tracking nahi thi).",
    links: [{ label: "Dashboard kholo", href: "/" }],
    related: ["stock-in", "stock-out", "adjust"],
  },
  {
    id: "new-product",
    title: "Naya product banana",
    category: "Setup",
    icon: "🆕",
    keywords: [
      "new product", "naya product", "add product", "product banana", "create product",
      "item add", "product add", "naya item", "sku banana", "ean add",
    ],
    intro: "Naya product do tarah se ban sakta hai:",
    steps: [
      "Sabse aasan: \"Stock In\" me naya code daalo aur naam likho — product wahin ban jayega aur stock bhi add ho jayega.",
      "Bina stock ke sirf product banana ho: warehouse → \"Add / Remove Stock\" → \"🆕 Add New Product\".",
      "Code (EAN/SKU), naam, aur zaroori detail bharo.",
      "Photo Catalog page se baad me add/edit kar sakte ho.",
    ],
    note: "Staff jo naya product banata hai woh admin approval me ja sakta hai. Admin approve karega tab Catalog me dikhega.",
    links: [
      { label: "Catalog", href: "/catalog" },
      { label: "Dashboard kholo", href: "/" },
    ],
    related: ["stock-in", "adjust", "import"],
  },
  {
    id: "channel",
    title: "Channel switch — E-commerce / B2B",
    category: "Setup",
    icon: "🔀",
    keywords: [
      "channel", "b2b", "ecommerce", "e-commerce", "ecom", "switch", "badalna",
      "amazon", "wipro", "philips", "sku dikhega", "ean dikhega", "channel change",
    ],
    intro: "App do channel me kaam karta hai — E-commerce aur B2B. Poora data (products, warehouse, order) channel ke hisaab se alag dikhta hai:",
    steps: [
      "Left sidebar me sabse upar Channel switcher hai.",
      "\"🛒 E-commerce\" ya \"🏢 B2B\" pe click karo.",
      "Poori app us channel pe switch ho jayegi.",
    ],
    note: "E-commerce me product ka primary code \"EAN\" kehlata hai aur stock-out par \"EAN\" scan hota hai. B2B me primary code \"SKU\" (Wipro SKU / Philips 12NC) hai aur stock-out par \"ASIN\" scan hota hai.",
    related: ["stock-in", "stock-out"],
  },
  {
    id: "purchase-order",
    title: "Purchase Order — vendor se order",
    category: "Orders",
    icon: "🛒",
    keywords: [
      "purchase order", "po", "vendor order", "order to vendor", "kharidna",
      "supplier", "order banana", "incoming", "vendor se order", "po receive",
    ],
    intro: "Vendor se maal mangwane ka record (PO) banane aur aane par stock me dalne ke liye:",
    steps: [
      "Sidebar → \"Purchase Orders\" (🛒) → naya PO banao.",
      "Vendor, items aur quantity bharo. PO \"pending\" banega.",
      "Order confirm hone par use \"confirmed\" (on the way) karo.",
      "Maal aane par PO kholo → \"Stock In\" dabao — saara maal warehouse me aa jayega.",
    ],
    note: "PO se Stock In karne par bhi History me tumhara naam log hota hai.",
    links: [{ label: "Purchase Orders", href: "/purchase-orders" }],
    related: ["stock-in", "vendors-customers", "release-order"],
  },
  {
    id: "release-order",
    title: "Release Order — platform order se stock out",
    category: "Orders",
    icon: "🚚",
    keywords: [
      "release order", "ro", "platform order", "blinkit", "zepto", "order out",
      "bulk order", "customer order", "ro banana", "release", "dispatch order",
    ],
    intro: "Kisi platform/customer ke order ko ek saath stock-out karne ke liye (Release Order):",
    steps: [
      "Sidebar → \"Release Orders\" (🚚) → naya RO banao.",
      "Warehouse, customer/source aur items+quantity bharo.",
      "Admin banaye to turant stock out ho jata hai; staff banaye to admin approval me jata hai.",
      "Approve hone par stock kam ho jata hai aur History me RO banane wale ka naam aata hai.",
    ],
    links: [{ label: "Release Orders", href: "/release-orders" }],
    related: ["stock-out", "purchase-order"],
  },
  {
    id: "combos-manage",
    title: "Combo banana (bundle recipe)",
    category: "Setup",
    icon: "🎁",
    keywords: [
      "combo banana", "create combo", "bundle banana", "combo setup", "kit banana",
      "combo recipe", "combo add", "make combo",
    ],
    intro: "Combo bechne se pehle uska recipe banana padta hai:",
    steps: [
      "Sidebar → \"Combos\" (🎁) kholo.",
      "Naya combo banao — naam aur (optional) barcode/price do.",
      "Combo me kaunse product kitne piece jaate hain, woh add karo.",
      "Save karo. Ab isko \"Stock Out → Combo\" se bech sakte ho.",
    ],
    links: [{ label: "Combos", href: "/combos" }],
    related: ["combo-out"],
  },
  {
    id: "vendors-customers",
    title: "Vendor / Customer add karna",
    category: "Setup",
    icon: "🏭",
    keywords: [
      "vendor", "customer", "supplier", "party", "grahak", "vendor add",
      "customer add", "naya vendor", "naya customer",
    ],
    intro: "Vendor (jisse kharidte ho) aur Customer (jise bechte ho) manage karne ke liye:",
    steps: [
      "Sidebar → \"Vendors\" (🏭) ya \"Customers\" (🧾) kholo.",
      "Naya add karo, ya list me se edit karo.",
      "Stock In me vendor ka naam likhoge to woh apne-aap yahan bhi save ho jata hai (same customer ke liye Stock Out me).",
    ],
    links: [
      { label: "Vendors", href: "/vendors" },
      { label: "Customers", href: "/customers" },
    ],
    related: ["stock-in", "stock-out", "purchase-order"],
  },
  {
    id: "login-roles",
    title: "Login, password & roles",
    category: "Account",
    icon: "🔐",
    keywords: [
      "login", "password", "sign in", "log in", "role", "admin", "staff",
      "account", "pass badalna", "reset password", "bhul gaya", "logout", "sign out",
    ],
    intro: "Login aur user roles ke bare me:",
    steps: [
      "Login page pe role (Admin/Staff) chuno aur password daalo — ya username + password se login karo.",
      "Do role hain: Admin (sab kuch) aur Staff (rozana ka kaam, kuch cheezein approval me).",
      "Sign out sidebar me neeche user card se hota hai.",
    ],
    note: "Naya user banana ya kisi ka password reset karna sirf admin karta hai — Admin (🔐) → Users. Password bhool gaye to admin se reset karwao.",
    links: [{ label: "Admin → Users", href: "/admin" }],
    related: ["warehouse-access"],
  },
  {
    id: "warehouse-access",
    title: "Warehouse access — staff ko ek warehouse tak seemit karna",
    category: "Admin",
    icon: "🏢",
    adminOnly: true,
    keywords: [
      "warehouse access", "permission", "staff warehouse", "limit staff",
      "sirf ek warehouse", "access dena", "restrict", "assign warehouse",
      "staff ko access", "user permission",
    ],
    intro: "Kisi staff ko sirf ek warehouse tak seemit karne ke liye (sirf admin):",
    steps: [
      "Admin (🔐) → Users kholo.",
      "User ko edit karke uska warehouse assign karo.",
      "Ab woh staff sirf usi warehouse ka stock dekh/change kar payega.",
    ],
    note: "Warehouse na assign karo to staff sab warehouse access kar sakta hai.",
    links: [{ label: "Admin → Users", href: "/admin" }],
    related: ["login-roles"],
  },
  {
    id: "reports",
    title: "Reports & Stock Aging",
    category: "Admin",
    icon: "📊",
    adminOnly: true,
    keywords: [
      "report", "reports", "aging", "stock aging", "valuation", "purana stock",
      "kitna stock", "value", "analysis", "dashboard report",
    ],
    intro: "Business ki summary aur purana (slow) stock dekhne ke liye (sirf admin):",
    steps: [
      "Sidebar → \"Reports\" (📊) — stock value aur summary.",
      "Sidebar → \"Stock Aging\" (🕒) — kaunsa maal kitne din se pada hai.",
    ],
    links: [
      { label: "Reports", href: "/reports" },
      { label: "Stock Aging", href: "/aging" },
    ],
    related: ["history"],
  },
  {
    id: "import",
    title: "Products bulk import",
    category: "Admin",
    icon: "📄",
    adminOnly: true,
    keywords: [
      "import", "bulk import", "excel", "csv", "bulk product", "ek saath product",
      "upload", "import products", "b2b import",
    ],
    intro: "Ek saath bahut saare products daalne ke liye (sirf admin):",
    steps: [
      "Admin (🔐) → Import kholo.",
      "Format chuno (jaise B2B ke liye \"ASIN·size·12NC\"), Brand set karo.",
      "Data paste/upload karke import karo.",
    ],
    links: [{ label: "Admin → Import", href: "/admin/import" }],
    related: ["new-product"],
  },
];

const STOP = new Set([
  "kaise", "kare", "karu", "karun", "karna", "karni", "kese", "how", "to", "the",
  "a", "an", "hai", "ha", "ka", "ke", "ki", "ko", "me", "mein", "kya", "do", "i",
  "ye", "yeh", "in", "on", "of", "is", "are", "for", "my", "and", "or", "hi",
  "ho", "gaya", "gayi", "raha", "chahiye", "hona",
]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Rank guides against a free-text question. Pure/offline. Returns best first. */
export function searchGuides(query: string): Guide[] {
  const q = norm(query);
  if (!q) return [];
  const tokens = q.split(" ").filter((t) => t.length >= 2 && !STOP.has(t));

  const scored = GUIDES.map((g) => {
    let score = 0;
    for (const kw of g.keywords) {
      const k = norm(kw);
      if (!k) continue;
      // Whole keyword/phrase present in the question — strongest signal.
      if (q.includes(k)) score += k.includes(" ") ? 5 : 3;
    }
    for (const t of tokens) {
      if (norm(g.title).includes(t)) score += 2;
      for (const kw of g.keywords) {
        const k = norm(kw);
        if (k === t) score += 2;
        else if (k.includes(t) || t.includes(k)) score += 1;
      }
    }
    return { g, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((x) => x.g);
}
