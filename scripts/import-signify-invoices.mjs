// Signify (Philips) invoice PDFs → Purchase Orders in the b2b channel.
//
// Reads invoice PDFs from a folder, extracts the line items, and creates one
// confirmed PO per invoice. Nothing is stocked in: you open Purchase Orders in
// the panel, pick a warehouse and hit Receive — that's when stock goes up.
//
// Credit Notes are skipped (they are price adjustments, not goods) and listed
// in the report so you can eyeball them.
//
// Run with the dev server up:
//   node scripts/import-signify-invoices.mjs                 # dry run (default)
//   node scripts/import-signify-invoices.mjs --commit        # actually create POs
//   node scripts/import-signify-invoices.mjs --month="Jul 2025" --commit
//   node scripts/import-signify-invoices.mjs --dir="C:/Users/DELL/Dropbox/SignifyInvoices"
//
// Deps:  npm install pdf-parse

import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const VENDOR_NAME = "Philips";
const DEFAULT_DIR = "C:/Users/DELL/Downloads/SignifyInvoices";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---- args ------------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const COMMIT = args.includes("--commit");
const DIR = arg("dir", DEFAULT_DIR);
const MONTH = arg("month", ""); // e.g. "Jul 2025"
const LIMIT = parseInt(arg("limit", "0"), 10) || 0;

// ---- PDF → structured invoice ---------------------------------------------

/** "31.03.2025" → "2025-03-31" */
function toISODate(dmy) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dmy || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "2025-03-31" → "Mar 2025" (for --month filtering) */
function monthLabel(iso) {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

const num = (s) => parseFloat(String(s).replace(/,/g, ""));

function parseInvoice(text) {
  const grab = (re) => {
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };

  const documentType = /Credit Note/i.test(text)
    ? "Credit Note"
    : /Debit Note/i.test(text)
      ? "Debit Note"
      : "Tax Invoice";

  // GST: an invoice carries either CGST+SGST (9+9) or IGST (18). Sum whatever
  // the document actually declares rather than assuming a rate.
  const cgst = parseFloat((text.match(/Central Tax\s+([\d.]+)\s*%/) || [])[1] || "0");
  const sgst = parseFloat((text.match(/State Tax\s+([\d.]+)\s*%/) || [])[1] || "0");
  const igst = parseFloat((text.match(/Integrated Tax\s+([\d.]+)\s*%/) || [])[1] || "0");
  const taxRate = igst > 0 ? igst : cgst + sgst;

  const documentDate = toISODate(grab(/Document Date\s+([\d.]+)/));

  const doc = {
    documentType,
    documentNumber: grab(/Document Number\s+(\S+)/),
    documentDate,
    monthLabel: monthLabel(documentDate),
    poNumber: grab(/PO number \/ Agreement\s+(.+)/),
    totalAmount: grab(/Total Amount\s+([\d,]+\.\d{2})/),
    taxRate,
    items: [],
  };

  // A line item looks like:
  //   2 929000262080 85395000 301 PCE 29.46 / 1 PCE 8,867.46
  // and the product description sits on the following line.
  const lines = text.split("\n");
  const itemRe =
    /^\s*(\d+)\s+(\d{9,15})\s+(\d{6,8})\s+([\d,]+)\s+(PCE|CAS|NOS|SET)\s+([\d,]+\.\d+)\s*\/\s*\d+\s+\w+\s+([\d,]+\.\d{2})/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(itemRe);
    if (!m) continue;

    let description = "";
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const l = lines[j].trim();
      if (!l) continue;
      if (/^(EOC:|EAN:|Net bef|Central Tax|State Tax|Integrated|IN:)/i.test(l)) break;
      description = l;
      break;
    }

    doc.items.push({
      materialCode: m[2], // 12NC — this is what product.ean holds for Philips b2b
      hsn: m[3],
      quantity: num(m[4]),
      unit: m[5],
      rate: num(m[6]),
      amount: num(m[7]),
      description: description || `Philips ${m[2]}`,
    });
  }

  return doc;
}

async function readPdf(file) {
  const parser = new PDFParse({ data: fs.readFileSync(file) });
  try {
    const { text } = await parser.getText();
    return text;
  } finally {
    await parser.destroy();
  }
}

// ---- API -------------------------------------------------------------------

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin", password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status}). Is the dev server running at ${BASE}?`);
  const sid = res.headers.get("set-cookie")?.split(";")[0];
  if (!sid) throw new Error("Login succeeded but no session cookie came back.");
  return `${sid}; channel=b2b`; // b2b — that's where the Philips catalog lives
}

async function existingInvoiceNumbers(cookie) {
  const res = await fetch(`${BASE}/api/purchase-orders`, { headers: { cookie } });
  if (!res.ok) throw new Error(`Could not list POs (${res.status}).`);
  const pos = await res.json();
  return new Set(pos.map((p) => p.invoiceNumber).filter(Boolean));
}

async function createPO(cookie, doc) {
  const body = {
    date: doc.documentDate,
    vendorName: VENDOR_NAME,
    invoiceNumber: doc.documentNumber,
    // warehouseId deliberately omitted — you choose the warehouse when receiving.
    items: doc.items.map((it) => ({
      hsnCode: it.hsn,
      ean: it.materialCode,
      productCode: it.materialCode,
      description: it.description,
      cartonSize: 1, // invoices are priced per piece, so 1 piece per "carton"
      cartonQty: it.quantity, // → totalQty = quantity
      rate: it.rate,
      taxRate: doc.taxRate,
    })),
  };

  const res = await fetch(`${BASE}/api/purchase-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PO create failed (${res.status}): ${err.slice(0, 200)}`);
  }
  return res.json();
}

// ---- main ------------------------------------------------------------------

(async () => {
  if (!fs.existsSync(DIR)) throw new Error(`Folder not found: ${DIR}`);

  let files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
  console.log(`📂 ${DIR}`);
  console.log(`📄 ${files.length} PDFs mile`);
  console.log(COMMIT ? "🔴 COMMIT MODE — POs banaye jayenge" : "🟢 DRY RUN — kuch nahi badlega (--commit se asli chalao)");
  if (MONTH) console.log(`📅 Sirf month: ${MONTH}`);
  console.log("");

  // In a dry run the server is optional — without it we just can't dedupe.
  let cookie = null;
  let alreadyImported = new Set();
  try {
    cookie = await login();
    alreadyImported = await existingInvoiceNumbers(cookie);
    console.log(`🔁 ${alreadyImported.size} invoice pehle se import ho chuki hain — wo skip hongi.\n`);
  } catch (e) {
    if (COMMIT) throw e;
    console.log(`⚠️  Server se baat nahi ho payi (${e.message})`);
    console.log(`   Dry run chal raha hai — duplicate check skip. Asli import se pehle server chalu karna.\n`);
  }

  const report = [];
  let created = 0,
    skippedCredit = 0,
    skippedDup = 0,
    skippedMonth = 0,
    noItems = 0,
    failed = 0,
    totalPieces = 0;

  for (const f of files) {
    if (LIMIT && created >= LIMIT) break;

    let doc;
    try {
      doc = parseInvoice(await readPdf(path.join(DIR, f)));
    } catch (e) {
      failed++;
      report.push({ file: f, status: "PARSE ERROR", note: e.message });
      console.log(`❌ ${f} — parse error: ${e.message}`);
      continue;
    }

    if (MONTH && doc.monthLabel !== MONTH) {
      skippedMonth++;
      continue;
    }
    if (doc.documentType !== "Tax Invoice") {
      skippedCredit++;
      report.push({
        file: f,
        status: "SKIPPED (Credit Note)",
        doc: doc.documentNumber,
        date: doc.documentDate,
        note: "Price adjustment — koi maal nahi. Khud check kar lena.",
      });
      continue;
    }
    if (!doc.documentNumber || doc.items.length === 0) {
      noItems++;
      report.push({ file: f, status: "NO LINE ITEMS", doc: doc.documentNumber, date: doc.documentDate });
      console.log(`⚠️  ${f} — koi line item nahi mila`);
      continue;
    }
    if (alreadyImported.has(doc.documentNumber)) {
      skippedDup++;
      continue;
    }

    const pieces = doc.items.reduce((s, i) => s + i.quantity, 0);

    if (COMMIT) {
      try {
        const po = await createPO(cookie, doc);
        alreadyImported.add(doc.documentNumber);
        created++;
        totalPieces += pieces;
        console.log(
          `✅ ${po.poNumber}  inv=${doc.documentNumber}  ${doc.documentDate}  ${doc.items.length} items  ${pieces} pcs`
        );
        report.push({
          file: f,
          status: "CREATED",
          po: po.poNumber,
          doc: doc.documentNumber,
          date: doc.documentDate,
          items: doc.items.length,
          pieces,
        });
      } catch (e) {
        failed++;
        console.log(`❌ ${f} — ${e.message}`);
        report.push({ file: f, status: "FAILED", doc: doc.documentNumber, note: e.message });
      }
    } else {
      created++;
      totalPieces += pieces;
      console.log(
        `📝 would create  inv=${doc.documentNumber}  ${doc.documentDate}  ${doc.items.length} items  ${pieces} pcs  (tax ${doc.taxRate}%)`
      );
      report.push({
        file: f,
        status: "WOULD CREATE",
        doc: doc.documentNumber,
        date: doc.documentDate,
        items: doc.items.length,
        pieces,
      });
    }
  }

  // report file
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = `signify-import-report-${stamp}.json`;
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log("\n================ SUMMARY ================");
  console.log(`${COMMIT ? "✅ POs created  " : "📝 Would create "}: ${created}`);
  console.log(`📦 Total pieces        : ${totalPieces}`);
  console.log(`⏭  Credit Notes skipped: ${skippedCredit}`);
  console.log(`⏭  Already imported    : ${skippedDup}`);
  if (MONTH) console.log(`⏭  Other months        : ${skippedMonth}`);
  console.log(`⚠️  No line items       : ${noItems}`);
  console.log(`❌ Failed              : ${failed}`);
  console.log(`\n📄 Report: ${out}`);
  if (!COMMIT) console.log(`\n👉 Sab theek lage to chalao:  node scripts/import-signify-invoices.mjs --commit`);
})().catch((e) => {
  console.error("\n💥 " + e.message);
  process.exit(1);
});
