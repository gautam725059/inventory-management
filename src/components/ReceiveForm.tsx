"use client";

import { useEffect, useState } from "react";
import type { Vendor } from "@/lib/types";

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
  name: "",
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

/** Form for receiving products into a warehouse by EAN + quantity. */
export default function ReceiveForm({ warehouseId, onReceived, onError }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  useEffect(() => {
    fetch("/api/vendors")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setVendors(Array.isArray(list) ? list : []))
      .catch(() => setVendors([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      const res = await fetch(`/api/warehouses/${warehouseId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ean: form.ean,
          quantity: Number(form.quantity),
          name: form.name || undefined,
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
            EAN / Barcode *
          </label>
          <input
            id="ean"
            className={inputClass}
            value={form.ean}
            onChange={(e) => setForm({ ...form, ean: e.target.value })}
            placeholder="8901234567890"
            inputMode="numeric"
            autoFocus
            required
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
          <label htmlFor="name" className={labelClass}>
            Product name
          </label>
          <input
            id="name"
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Required for a new EAN; optional otherwise"
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
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Receiving…" : "Receive into warehouse"}
        </button>
      </div>
    </form>
  );
}
