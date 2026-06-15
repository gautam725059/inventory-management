"use client";

import { useMemo, useState } from "react";
import type { WarehouseStockLine } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

interface Props {
  warehouseId: string;
  /** Current stock lines in this warehouse (products available to dispatch). */
  lines: WarehouseStockLine[];
  /** Called after a successful dispatch so the parent can reload. */
  onDispatched: () => void | Promise<void>;
  onError: (message: string) => void;
}

/** Form for dispatching stock out as packs (pack of 10 / 5 / single). */
export default function StockOutForm({
  warehouseId,
  lines,
  onDispatched,
  onError,
}: Props) {
  const inStock = lines.filter((l) => l.quantity > 0);

  const [ean, setEan] = useState("");
  const [unitSize, setUnitSize] = useState("1");
  const [packs, setPacks] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => inStock.find((l) => l.ean === ean),
    [inStock, ean]
  );

  // Pack-size options: always "Single" (1), plus the product's combo sizes.
  const sizeOptions = useMemo(() => {
    const sizes = new Set<number>([1, ...(selected?.comboSizes ?? [])]);
    return Array.from(sizes).sort((a, b) => a - b);
  }, [selected]);

  const size = Number(unitSize) || 1;
  const packCount = Number(packs) || 0;
  const pieces = size * packCount;
  const available = selected?.quantity ?? 0;
  const remaining = available - pieces;
  const overdraw = pieces > available;

  function pickProduct(nextEan: string) {
    setEan(nextEan);
    setUnitSize("1"); // reset pack size when switching product
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      const res = await fetch(`/api/warehouses/${warehouseId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ean, unitSize: size, packs: packCount }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to dispatch goods.");
      }
      setEan("");
      setUnitSize("1");
      setPacks("");
      await onDispatched();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to dispatch goods.");
    } finally {
      setSaving(false);
    }
  }

  if (inStock.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Nothing in stock to dispatch. Add stock first via Stock In.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="mb-4 text-base font-semibold text-slate-900">
        Stock out — dispatch packs
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="product" className={labelClass}>
            Product *
          </label>
          <select
            id="product"
            className={inputClass}
            value={ean}
            onChange={(e) => pickProduct(e.target.value)}
            required
          >
            <option value="">Select a product…</option>
            {inStock.map((l) => (
              <option key={l.ean} value={l.ean}>
                {l.name} ({l.quantity} pcs)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="unitSize" className={labelClass}>
            Pack size *
          </label>
          <select
            id="unitSize"
            className={inputClass}
            value={unitSize}
            onChange={(e) => setUnitSize(e.target.value)}
            disabled={!selected}
          >
            {sizeOptions.map((s) => (
              <option key={s} value={s}>
                {s === 1 ? "Single (1)" : `Pack of ${s}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="packs" className={labelClass}>
            Number of packs *
          </label>
          <input
            id="packs"
            type="number"
            min={1}
            step={1}
            className={inputClass}
            value={packs}
            onChange={(e) => setPacks(e.target.value)}
            placeholder="1"
            disabled={!selected}
            required
          />
        </div>
      </div>

      {selected && packCount > 0 && (
        <p
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            overdraw
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          Dispatching{" "}
          <strong className={overdraw ? "text-red-700" : "text-brand-700"}>
            {pieces}
          </strong>{" "}
          pieces ({packCount} × {size === 1 ? "single" : `pack of ${size}`}).{" "}
          {overdraw
            ? `Only ${available} in stock.`
            : `${remaining} pieces will remain.`}
        </p>
      )}

      <div className="mt-5">
        <button
          type="submit"
          disabled={saving || !selected || packCount <= 0 || overdraw}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Dispatching…" : "Dispatch (stock out)"}
        </button>
      </div>
    </form>
  );
}
