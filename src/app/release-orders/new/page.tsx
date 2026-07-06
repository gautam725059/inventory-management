"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import type { WarehouseSummary, ProductCatalogEntry } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const MAX_LINES = 10;

function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function num(s: string): number {
  return Number(String(s).replace(/[^0-9.\-]/g, "")) || 0;
}

const SAMPLE = `EAN, Quantity, Landing Rate, GST%, MRP, Description
8906199312417, 106, 230, 18, 999, Shanya 3-Fold Windproof Compact Umbrella
8906199313018, 35, 229, 5, 999, Shanya Rain Suit (Blue)`;

interface PLine {
  ean: string;
  quantity: string;
  landingRate: number;
  gstRate: number;
  mrp?: number;
  description: string;
}

/** Auto-detect EAN / Qty / Rate / GST / MRP / Description columns from sheet
 *  rows (keyed by header) and build line items. Handles varied layouts. */
function buildLinesFromRows(
  rows: Record<string, unknown>[]
): { lines: PLine[]; error?: string } {
  if (!rows.length) return { lines: [], error: "The sheet is empty." };
  const keys = Object.keys(rows[0]).map((k) => ({
    raw: k,
    norm: k.replace(/\s+/g, " ").trim(),
  }));
  const find = (re: RegExp) => keys.find((k) => re.test(k.norm))?.raw;

  let eanKey = find(/^(ean|upc|barcode|product upc)$/i) || find(/\b(ean|upc|barcode)\b/i);
  // Fallback: a column whose values mostly look like barcodes.
  if (!eanKey) {
    for (const k of keys) {
      const vals = rows.slice(0, 12).map((r) => String(r[k.raw] ?? "").replace(/[^0-9]/g, ""));
      const hits = vals.filter((v) => v.length >= 6 && v.length <= 14).length;
      if (hits >= Math.max(3, vals.filter((v) => v).length - 1)) {
        eanKey = k.raw;
        break;
      }
    }
  }
  if (!eanKey) return { lines: [], error: "Couldn't find an EAN / Barcode / UPC column in the file." };

  const qtyKey = find(/^(qty|quantity)$/i) || find(/\b(qty|quantity)\b/i);
  if (!qtyKey) return { lines: [], error: "Couldn't find a Quantity column in the file." };

  const rateKey = find(/landing|rate/i);
  const cgstKey = find(/cgst/i);
  const sgstKey = find(/sgst/i);
  const igstKey = find(/igst/i);
  const gstKey = find(/^gst|gst %|tax %/i);
  const mrpKey = find(/mrp/i);
  const descKey = find(/description|product name|item name|code name/i);

  const n = (v: unknown) => Number(String(v ?? "").replace(/[^0-9.\-]/g, "")) || 0;
  const out: PLine[] = [];
  for (const r of rows) {
    const ean = String(r[eanKey] ?? "").replace(/[^0-9]/g, "");
    if (!ean) continue;
    const quantity = Math.floor(n(r[qtyKey]));
    if (quantity <= 0) continue;
    const gstRate =
      cgstKey || sgstKey
        ? n(r[cgstKey ?? ""]) + n(r[sgstKey ?? ""])
        : igstKey
          ? n(r[igstKey])
          : gstKey
            ? n(r[gstKey])
            : 0;
    out.push({
      ean,
      quantity: String(quantity),
      landingRate: rateKey ? n(r[rateKey]) : 0,
      gstRate,
      mrp: mrpKey ? n(r[mrpKey]) || undefined : undefined,
      description: descKey ? String(r[descKey] ?? "") : "",
    });
  }
  return { lines: out };
}

export default function NewReleaseOrderPage() {
  const router = useRouter();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [products, setProducts] = useState<ProductCatalogEntry[]>([]);

  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(today());
  const [source, setSource] = useState("Blinkit");
  const [customerName, setCustomerName] = useState("");
  const [cartDiscount, setCartDiscount] = useState("");
  const [raw, setRaw] = useState("");
  const [lines, setLines] = useState<PLine[] | null>(null);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/warehouses").then((r) => (r.ok ? r.json() : [])).then((d) => {
      const list = Array.isArray(d) ? d : [];
      setWarehouses(list);
      if (list[0]) setWarehouseId(list[0].id);
    }).catch(() => {});
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const productByEan = useMemo(() => {
    const m = new Map<string, ProductCatalogEntry>();
    for (const p of products) {
      m.set(p.ean, p);
      for (const b of p.barcodes ?? []) m.set(b.ean, p);
    }
    return m;
  }, [products]);

  function parse() {
    setError(null);
    const rows = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const out: PLine[] = [];
    let skippedHeader = false;
    for (const row of rows) {
      const cols = row.split(row.includes("\t") ? "\t" : ",").map((c) => c.trim());
      // Skip a header row.
      if (!skippedHeader && /ean|barcode|upc/i.test(row) && /qty|quantity/i.test(row)) {
        skippedHeader = true;
        continue;
      }
      const ean = (cols[0] || "").replace(/[^0-9]/g, "");
      if (!ean) continue;
      out.push({
        ean,
        quantity: String(Math.floor(num(cols[1] || "0"))),
        landingRate: num(cols[2] || "0"),
        gstRate: num(cols[3] || "0"),
        mrp: cols[4] ? num(cols[4]) : undefined,
        description: cols.slice(5).join(", ") || "",
      });
    }
    if (out.length === 0) {
      setLines(null);
      setError("Could not read any lines. Use: EAN, Quantity, Landing Rate, GST%, MRP, Description");
      return;
    }
    let note: string | null = null;
    if (out.length > MAX_LINES) {
      note = `Only the first ${MAX_LINES} lines are kept (you pasted ${out.length}). Process the rest as another RO.`;
    }
    setParseNote(note);
    setLines(out.slice(0, MAX_LINES));
  }

  async function handleFile(file: File) {
    setError(null);
    setParseNote(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
      const { lines: parsed, error: e } = buildLinesFromRows(rows);
      if (e) {
        setLines(null);
        setError(e);
        return;
      }
      if (parsed.length === 0) {
        setLines(null);
        setError("No rows with a valid EAN + Quantity were found in the file.");
        return;
      }
      setParseNote(
        parsed.length > MAX_LINES
          ? `Read ${parsed.length} lines — only the first ${MAX_LINES} are kept. Process the rest as another RO.`
          : `Read ${parsed.length} line(s) from the file.`
      );
      setLines(parsed.slice(0, MAX_LINES));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the file.");
    }
  }

  function setLineQty(i: number, q: string) {
    setLines((ls) => (ls ? ls.map((l, idx) => (idx === i ? { ...l, quantity: q } : l)) : ls));
  }
  function removeLine(i: number) {
    setLines((ls) => (ls ? ls.filter((_, idx) => idx !== i) : ls));
  }

  // Per-line resolution against the selected warehouse.
  const resolved = useMemo(() => {
    if (!lines) return [];
    const combined = new Map<string, number>();
    for (const l of lines) {
      const p = productByEan.get(l.ean);
      if (p) combined.set(p.ean, (combined.get(p.ean) ?? 0) + (Number(l.quantity) || 0));
    }
    return lines.map((l) => {
      const p = productByEan.get(l.ean);
      const available =
        p?.byWarehouse.find((b) => b.warehouseId === warehouseId)?.quantity ?? 0;
      const qty = Number(l.quantity) || 0;
      const need = p ? combined.get(p.ean) ?? 0 : 0;
      return { line: l, product: p, available, qty, overdraw: !!p && need > available };
    });
  }, [lines, productByEan, warehouseId]);

  const unmatched = resolved.filter((r) => !r.product).length;
  const anyOverdraw = resolved.some((r) => r.overdraw);
  const totalQty = resolved.reduce((a, r) => a + r.qty, 0);
  const totalAmount = resolved.reduce((a, r) => a + r.line.landingRate * r.qty, 0);

  const canConfirm =
    !!warehouseId &&
    !!date.trim() &&
    resolved.length > 0 &&
    unmatched === 0 &&
    !anyOverdraw &&
    resolved.every((r) => r.qty > 0);

  async function confirm() {
    if (!canConfirm || !lines) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/release-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: date.trim(),
          source: source.trim() || undefined,
          warehouseId,
          customerName: customerName.trim() || undefined,
          cartDiscount: num(cartDiscount),
          lines: lines.map((l) => ({
            ean: l.ean,
            quantity: Number(l.quantity) || 0,
            landingRate: l.landingRate,
            gstRate: l.gstRate,
            mrp: l.mrp,
            description: l.description || undefined,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create RO.");
      router.push(`/release-orders/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create RO.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Link href="/release-orders" className="text-sm font-medium text-brand-600 hover:underline">
        ← Release Orders
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Release Order</h1>
        <p className="mt-1 text-sm text-slate-500">
          Paste the order (CSV, up to {MAX_LINES} lines), match EANs, and dispatch the stock.
        </p>
      </header>

      {!isAdmin && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Note: staff release orders need <strong>admin approval</strong>. Stock
          is dispatched only after an admin approves — nothing is deducted right
          now.
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Header fields */}
      <div className="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-5">
        <div>
          <label className={labelClass}>Warehouse *</label>
          <select className={inputClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Source</label>
          <input className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Blinkit" />
        </div>
        <div>
          <label className={labelClass}>Customer</label>
          <input className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="optional" />
        </div>
        <div>
          <label className={labelClass}>Cart Discount (₹)</label>
          <input type="number" min={0} className={inputClass} value={cartDiscount} onChange={(e) => setCartDiscount(e.target.value)} placeholder="0" />
        </div>
      </div>

      {/* File upload (primary) */}
      <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <label className="mb-1 block text-sm font-semibold text-slate-800">
          📄 Upload Excel / CSV
        </label>
        <p className="mb-2 text-xs text-slate-500">
          Excel (.xlsx) ya CSV file daalo — app khud <strong>EAN</strong> aur{" "}
          <strong>Quantity</strong> columns dhoondh legi. (Google Sheet → File →
          Download → Microsoft Excel / CSV)
        </p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
        />
      </div>

      {/* Paste (fallback) */}
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-medium text-slate-600">
          …or paste manually — <code>EAN, Quantity, Landing Rate, GST%, MRP, Description</code>
        </label>
        <button onClick={() => setRaw(SAMPLE)} className="text-xs font-medium text-brand-600 hover:underline">
          Load sample
        </button>
      </div>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={6}
        placeholder="Paste rows here (comma or tab separated)…"
        className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      <button
        onClick={parse}
        disabled={!raw.trim()}
        className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
      >
        Parse &amp; review
      </button>

      {parseNote && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{parseNote}</div>
      )}

      {/* Review */}
      {lines && resolved.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-base font-semibold text-slate-900">Review &amp; match</h2>
          {(unmatched > 0 || anyOverdraw) && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {unmatched > 0 && `${unmatched} EAN(s) not in catalog. `}
              {anyOverdraw && "Some lines exceed available stock. "}
              Fix or remove these lines to dispatch.
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">EAN</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Available</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Rate</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((r, i) => (
                  <tr key={i} className={`border-b border-slate-100 last:border-0 ${r.overdraw || !r.product ? "bg-red-50/40" : ""}`}>
                    <td className="px-3 py-2 font-mono text-xs">{r.line.ean}</td>
                    <td className="px-3 py-2">
                      {r.product ? (
                        <span className="text-slate-900">{r.product.name}</span>
                      ) : (
                        <span className="font-medium text-red-600">Not in catalog</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.overdraw ? "font-semibold text-red-600" : "text-slate-600"}`}>
                      {r.product ? r.available.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={1}
                        value={r.line.quantity}
                        onChange={(e) => setLineQty(i, e.target.value)}
                        className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.line.landingRate || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">
                      {inr(r.line.landingRate * r.qty)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeLine(i)} className="text-xs text-slate-400 hover:text-red-600" aria-label="Remove">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-3 py-2" colSpan={3}>Total ({resolved.length} items)</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totalQty.toLocaleString()}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right tabular-nums">{inr(totalAmount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-5 flex items-center justify-end">
            <button
              onClick={confirm}
              disabled={saving || !canConfirm}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? isAdmin
                  ? "Dispatching…"
                  : "Submitting…"
                : isAdmin
                  ? "Confirm & Stock Out"
                  : "Submit for approval"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
