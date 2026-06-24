"use client";

import { useEffect, useMemo, useState } from "react";
import { useChannel, codeLabel, codeWord } from "@/lib/useChannel";
import type { Vendor, ProductCatalogEntry } from "@/lib/types";

/** Today's date as YYYY-MM-DD, for the date input default. */
function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const EMPTY_FORM = {
  ean: "",
  quantity: "",
  reorderLevel: "",
  vendorName: "",
  bill: "",
  date: today(),
  purchasePrice: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

interface Props {
  warehouseId: string;
  /** Called after a successful receive (or queued request) so the parent can
   *  react. `pending` is true when the stock-in awaits admin approval. */
  onReceived: (result: { pending: boolean }) => void | Promise<void>;
  /** Surface a failure to the parent's error banner. */
  onError: (message: string) => void;
}

/** Form for receiving stock into a warehouse. The EAN is scanned/typed and the
 *  product name is resolved from the catalog (read-only). Receiving is blocked
 *  unless the EAN matches an existing product. */
export default function ReceiveForm({ warehouseId, onReceived, onError }: Props) {
  const channel = useChannel();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<ProductCatalogEntry[]>([]);

  useEffect(() => {
    fetch("/api/vendors")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setVendors(Array.isArray(list) ? list : []))
      .catch(() => setVendors([]));
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setProducts(Array.isArray(list) ? list : []))
      .catch(() => setProducts([]));
  }, []);

  // Resolve the entered EAN to a catalog product — by primary EAN or any of its
  // pack barcodes. The product name is shown read-only from this.
  const matchedProduct = useMemo(() => {
    const e = form.ean.trim();
    if (!e) return undefined;
    return products.find(
      (p) => p.ean === e || (p.barcodes ?? []).some((b) => b.ean === e)
    );
  }, [form.ean, products]);

  const eanEntered = form.ean.trim().length > 0;
  const noMatch = eanEntered && !matchedProduct;
  const productName = matchedProduct?.name ?? "";

  const canSubmit =
    !!matchedProduct &&
    Number(form.quantity) > 0 &&
    form.vendorName.trim().length > 0 &&
    form.bill.trim().length > 0 &&
    form.date.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Block unless the EAN resolves to an existing product.
    if (!matchedProduct) {
      onError(
        `${codeWord(channel)} does not match any product. Add it via Add New Product first.`
      );
      return;
    }
    setSaving(true);
    onError("");
    try {
      const res = await fetch(`/api/warehouses/${warehouseId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ean: form.ean.trim(),
          quantity: Number(form.quantity),
          name: matchedProduct.name,
          reorderLevel: form.reorderLevel ? Number(form.reorderLevel) : undefined,
          vendorName: form.vendorName,
          bill: form.bill,
          date: form.date,
          purchasePrice: form.purchasePrice || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to receive goods.");
      }
      const data = await res.json().catch(() => ({}));
      // Reset the per-item fields but keep vendor / bill / date — successive
      // line items usually share the same bill.
      setForm((f) => ({
        ...EMPTY_FORM,
        vendorName: f.vendorName,
        bill: f.bill,
        date: f.date,
      }));
      await onReceived({ pending: !!data.pending });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to receive goods.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="mb-4 text-base font-semibold text-slate-900">
        Receive products
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="ean" className={labelClass}>
            {codeLabel(channel)} *
          </label>
          <input
            id="ean"
            className={inputClass}
            value={form.ean}
            onChange={(e) => setForm({ ...form, ean: e.target.value })}
            placeholder={`Scan or type the ${codeWord(channel)}…`}
            inputMode="numeric"
            autoComplete="off"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            required
          />
          {matchedProduct && (
            <p className="mt-1 truncate text-xs text-emerald-600">
              ✓ {matchedProduct.name}
            </p>
          )}
          {noMatch && (
            <p className="mt-1 text-xs font-medium text-red-600">
              No product matches this {codeWord(channel)}.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="name" className={labelClass}>
            Product name
          </label>
          <input
            id="name"
            className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-700`}
            value={productName}
            readOnly
            tabIndex={-1}
            placeholder="Auto-filled from the EAN"
          />
        </div>
        <div>
          <label htmlFor="quantity" className={labelClass}>
            Quantity (pieces) *
          </label>
          <input
            id="quantity"
            type="number"
            min={1}
            step={1}
            className={inputClass}
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="100"
            required
          />
        </div>
        <div>
          <label htmlFor="vendorName" className={labelClass}>
            Vendor name *
          </label>
          <input
            id="vendorName"
            list="vendor-list"
            className={inputClass}
            value={form.vendorName}
            onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
            placeholder="Pick or type a vendor…"
            autoComplete="off"
            required
          />
          <datalist id="vendor-list">
            {vendors.map((v) => (
              <option key={v.id} value={v.name} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="bill" className={labelClass}>
            Bill no. *
          </label>
          <input
            id="bill"
            className={inputClass}
            value={form.bill}
            onChange={(e) => setForm({ ...form, bill: e.target.value })}
            placeholder="e.g. BILL-2026-001"
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label htmlFor="date" className={labelClass}>
            Date *
          </label>
          <input
            id="date"
            type="date"
            className={inputClass}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="purchasePrice" className={labelClass}>
            Purchase price (per piece)
          </label>
          <input
            id="purchasePrice"
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            value={form.purchasePrice}
            onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
            placeholder="Cost price, optional"
          />
        </div>
        <div>
          <label htmlFor="reorderLevel" className={labelClass}>
            Reorder level (low-stock alert)
          </label>
          <input
            id="reorderLevel"
            type="number"
            min={0}
            step={1}
            className={inputClass}
            value={form.reorderLevel}
            onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="mt-5">
        <button
          type="submit"
          disabled={saving || !canSubmit}
          title={!matchedProduct ? "Enter an EAN that matches a product" : ""}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Receiving…" : "Receive into warehouse"}
        </button>
      </div>
    </form>
  );
}
