"use client";

import { useState } from "react";

const EMPTY_FORM = {
  ean: "",
  quantity: "",
  name: "",
  comboSizes: "",
  reorderLevel: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

interface Props {
  warehouseId: string;
  /** Called after a successful receive so the parent can reload its stock. */
  onReceived: () => void | Promise<void>;
  /** Surface a failure to the parent's error banner. */
  onError: (message: string) => void;
}

/** Form for receiving products into a warehouse by EAN + quantity. */
export default function ReceiveForm({ warehouseId, onReceived, onError }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      const comboSizes = form.comboSizes
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);

      const res = await fetch(`/api/warehouses/${warehouseId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ean: form.ean,
          quantity: Number(form.quantity),
          name: form.name || undefined,
          comboSizes: comboSizes.length ? comboSizes : undefined,
          reorderLevel: form.reorderLevel ? Number(form.reorderLevel) : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to receive goods.");
      }
      setForm(EMPTY_FORM);
      await onReceived();
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <label htmlFor="name" className={labelClass}>
            Product name (new EANs)
          </label>
          <input
            id="name"
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Optional"
          />
        </div>
        <div>
          <label htmlFor="comboSizes" className={labelClass}>
            Combo pack sizes
          </label>
          <input
            id="comboSizes"
            className={inputClass}
            value={form.comboSizes}
            onChange={(e) => setForm({ ...form, comboSizes: e.target.value })}
            placeholder="10, 5"
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
