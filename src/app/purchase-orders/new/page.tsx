"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import type { Vendor, WarehouseSummary, ProductCatalogEntry } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

interface DraftLine {
  hsnCode: string;
  ean: string;
  description: string;
  cartonSize: string;
  cartonQty: string;
  rate: string;
  taxRate: string;
}

const EMPTY_LINE: DraftLine = {
  hsnCode: "",
  ean: "",
  description: "",
  cartonSize: "",
  cartonQty: "",
  rate: "",
  taxRate: "18",
};

function calc(l: DraftLine) {
  const cartonSize = Math.max(0, Math.floor(Number(l.cartonSize) || 0));
  const cartonQty = Math.max(0, Math.floor(Number(l.cartonQty) || 0));
  const totalQty = cartonSize * cartonQty;
  const rate = Math.max(0, Number(l.rate) || 0);
  const taxRate = Math.max(0, Number(l.taxRate) || 0);
  const taxAmount = round2((rate * taxRate) / 100);
  const amount = round2(rate + taxAmount);
  const totalAmount = round2(amount * totalQty);
  return { totalQty, taxAmount, amount, totalAmount };
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [products, setProducts] = useState<ProductCatalogEntry[]>([]);

  const [date, setDate] = useState(today());
  const [vendorName, setVendorName] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vendors").then((r) => (r.ok ? r.json() : [])).then((d) => setVendors(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/warehouses").then((r) => (r.ok ? r.json() : [])).then((d) => setWarehouses(Array.isArray(d) ? d : [])).catch(() => {});
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

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  /** When an EAN matches a catalog product, auto-fill its description. */
  function onEanChange(i: number, ean: string) {
    const p = productByEan.get(ean.trim());
    setLines((ls) =>
      ls.map((l, idx) =>
        idx === i ? { ...l, ean, description: p ? p.name : l.description } : l
      )
    );
  }

  function addLine() {
    setLines((ls) => [...ls, { ...EMPTY_LINE }]);
  }
  function removeLine(i: number) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));
  }

  const grandTotal = round2(lines.reduce((s, l) => s + calc(l).totalAmount, 0));

  const validLines = lines.filter(
    (l) => l.ean.trim() && l.description.trim() && calc(l).totalQty > 0
  );
  const canSubmit = vendorName.trim() && date.trim() && validLines.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError("Add a vendor, date, and at least one complete line (EAN, description, cartons).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: date.trim(),
          vendorName: vendorName.trim(),
          warehouseId: warehouseId || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          items: validLines.map((l) => ({
            hsnCode: l.hsnCode.trim() || undefined,
            ean: l.ean.trim(),
            description: l.description.trim(),
            cartonSize: Number(l.cartonSize) || 0,
            cartonQty: Number(l.cartonQty) || 0,
            rate: Number(l.rate) || 0,
            taxRate: Number(l.taxRate) || 0,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create PO.");
      router.push(`/purchase-orders/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create PO.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Link href="/purchase-orders" className="text-sm font-medium text-brand-600 hover:underline">
        ← Purchase Orders
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Purchase Order</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isAdmin
            ? "As admin, this PO is confirmed immediately."
            : "Your PO will be submitted for admin approval before it's confirmed."}
        </p>
      </header>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Header fields */}
        <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4">
          <div>
            <label className={labelClass}>Date *</label>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Vendor *</label>
            <input
              list="po-vendors"
              className={inputClass}
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="Pick or type a vendor…"
              autoComplete="off"
              required
            />
            <datalist id="po-vendors">
              {vendors.map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelClass}>Deliver to warehouse</label>
            <select className={inputClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">— optional —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Invoice number</label>
            <input className={inputClass} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="optional" autoComplete="off" />
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-3">
          {lines.map((l, i) => {
            const c = calc(l);
            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Line {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    disabled={lines.length === 1}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    ✕ Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className={labelClass}>Product UPC (EAN) *</label>
                    <input className={inputClass} inputMode="numeric" value={l.ean} onChange={(e) => onEanChange(i, e.target.value)} placeholder="89062…" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Product Description *</label>
                    <input className={inputClass} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Auto-fills from EAN" />
                  </div>
                  <div>
                    <label className={labelClass}>HSN Code</label>
                    <input className={inputClass} value={l.hsnCode} onChange={(e) => setLine(i, { hsnCode: e.target.value })} placeholder="e.g. 96151900" />
                  </div>
                  <div>
                    <label className={labelClass}>Carton Size</label>
                    <input type="number" min={0} className={inputClass} value={l.cartonSize} onChange={(e) => setLine(i, { cartonSize: e.target.value })} placeholder="240" />
                  </div>
                  <div>
                    <label className={labelClass}>Carton Qty</label>
                    <input type="number" min={0} className={inputClass} value={l.cartonQty} onChange={(e) => setLine(i, { cartonQty: e.target.value })} placeholder="3" />
                  </div>
                  <div>
                    <label className={labelClass}>Total Qty</label>
                    <input className={`${inputClass} bg-slate-50`} value={c.totalQty.toLocaleString("en-IN")} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className={labelClass}>Rate (₹/pc)</label>
                    <input type="number" min={0} step="0.01" className={inputClass} value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} placeholder="190" />
                  </div>
                  <div>
                    <label className={labelClass}>Tax Rate (%)</label>
                    <input type="number" min={0} step="0.01" className={inputClass} value={l.taxRate} onChange={(e) => setLine(i, { taxRate: e.target.value })} placeholder="18" />
                  </div>
                  <div>
                    <label className={labelClass}>Tax Amount (₹/pc)</label>
                    <input className={`${inputClass} bg-slate-50`} value={c.taxAmount} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className={labelClass}>Amount (₹/pc)</label>
                    <input className={`${inputClass} bg-slate-50`} value={c.amount} readOnly tabIndex={-1} />
                  </div>
                </div>
                <div className="mt-3 text-right text-sm text-slate-600">
                  Line total:{" "}
                  <strong className="tabular-nums text-slate-900">{inr(c.totalAmount)}</strong>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addLine}
          className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-slate-50"
        >
          + Add line
        </button>

        {/* Grand total + submit */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-lg">
            Grand Total:{" "}
            <strong className="tabular-nums text-slate-900">{inr(grandTotal)}</strong>
          </div>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : isAdmin
                ? "Create & confirm PO"
                : "Submit PO for approval"}
          </button>
        </div>
      </form>
    </div>
  );
}
