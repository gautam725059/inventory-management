"use client";

import { useState } from "react";
import type { WarehouseStockLine } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

interface Props {
  line: WarehouseStockLine;
  /** When provided (with onChanged), the card shows Edit / Remove controls. */
  warehouseId?: string;
  onChanged?: () => void | Promise<void>;
  onError?: (message: string) => void;
}

/** One product's stock in a warehouse, with combo breakdown, low-stock flag,
 *  and optional inline editing. */
export default function StockCard({
  line,
  warehouseId,
  onChanged,
  onError,
}: Props) {
  const editable = Boolean(warehouseId && onChanged);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(line.name);
  const [comboSizes, setComboSizes] = useState(line.comboSizes.join(", "));
  const [reorderLevel, setReorderLevel] = useState(String(line.reorderLevel));
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setName(line.name);
    setComboSizes(line.comboSizes.join(", "));
    setReorderLevel(String(line.reorderLevel));
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    onError?.("");
    try {
      const sizes = comboSizes
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      const res = await fetch(`/api/products/${line.ean}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          comboSizes: sizes,
          reorderLevel: Number(reorderLevel) || 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save product.");
      }
      setEditing(false);
      await onChanged?.();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to save product.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Remove "${line.name}" (${line.quantity} pcs) from this warehouse?`
      )
    ) {
      return;
    }
    setBusy(true);
    onError?.("");
    try {
      const res = await fetch(
        `/api/warehouses/${warehouseId}/stock/${line.ean}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove stock line.");
      }
      await onChanged?.();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to remove.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        line.lowStock ? "border-amber-300 ring-1 ring-amber-100" : "border-slate-200"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {line.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={line.imageUrl}
              alt={line.name}
              className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-base text-slate-300">
              📷
            </span>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{line.name}</span>
              {line.lowStock && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Low stock
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              EAN {line.ean}
              {line.reorderLevel > 0 && (
                <span className="ml-2 text-slate-400">
                  · reorder at {line.reorderLevel}
                </span>
              )}
            </div>
          </div>
        </div>
        <span
          className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm font-bold tabular-nums ${
            line.lowStock
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {line.quantity.toLocaleString()} pcs
        </span>
      </div>

      {line.combos.length === 0 ? (
        <p className="text-sm text-slate-400">
          Combos are chosen at stock-out.
          {editable ? " Use Edit to pin preset pack sizes here." : ""}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {line.combos.map((c) => (
            <div
              key={c.size}
              className="flex min-w-23 flex-col rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="text-xl font-bold tabular-nums text-emerald-600">
                {c.packs}
              </span>
              <span className="text-xs text-slate-500">packs of {c.size}</span>
              {c.leftover > 0 && (
                <span className="mt-0.5 text-xs text-brand-600">
                  +{c.leftover} loose
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && !editing && (
        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
          <button
            onClick={startEdit}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Edit
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      )}

      {editable && editing && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Product name</label>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Combo pack sizes</label>
              <input
                className={inputClass}
                value={comboSizes}
                onChange={(e) => setComboSizes(e.target.value)}
                placeholder="10, 5"
              />
            </div>
            <div>
              <label className={labelClass}>Reorder level (0 = off)</label>
              <input
                type="number"
                min={0}
                step={1}
                className={inputClass}
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
