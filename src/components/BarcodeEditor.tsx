"use client";

import { useState } from "react";
import type { PackBarcode } from "@/lib/types";

interface Props {
  /** The product's primary EAN (treated as the "single" barcode). */
  ean: string;
  name: string;
  barcodes: PackBarcode[];
  onClose: () => void;
  /** Called after barcodes are saved so the parent can reload. */
  onSaved: () => void | Promise<void>;
}

interface Row {
  ean: string;
  size: string; // kept as a string while editing
  pname: string; // optional pack name
  price: string; // optional pack price
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

/** Modal to manage a product's pack barcodes — one EAN per pack size (single,
 *  pack of 10, pack of 5 …). Scanning any of these in Stock-Out auto-fills the
 *  pack size. */
export default function BarcodeEditor({
  ean,
  name,
  barcodes,
  onClose,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<Row[]>(
    barcodes.length > 0
      ? barcodes.map((b) => ({
          ean: b.ean,
          size: String(b.size),
          pname: b.name ?? "",
          price: b.price != null ? String(b.price) : "",
        }))
      : [{ ean: "", size: "", pname: "", price: "" }]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { ean: "", size: "", pname: "", price: "" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function save() {
    setError(null);

    // Drop blank rows, then validate the rest.
    const filled = rows.filter((r) => r.ean.trim() || r.size.trim());
    const barcodesOut: PackBarcode[] = [];
    const seen = new Set<string>();
    for (const r of filled) {
      const e = r.ean.trim();
      const size = Number(r.size);
      if (!e) return setError("Every barcode row needs an EAN.");
      if (e === ean) {
        return setError(
          `${e} is the product's primary EAN (the single unit) — no need to add it.`
        );
      }
      if (!Number.isInteger(size) || size <= 0) {
        return setError(`Pack size for ${e} must be a positive whole number.`);
      }
      if (seen.has(e)) return setError(`Duplicate barcode: ${e}.`);
      seen.add(e);
      const price = r.price.trim() ? Number(r.price) : undefined;
      if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
        return setError(`Price for ${e} must be a non-negative number.`);
      }
      barcodesOut.push({
        ean: e,
        size,
        name: r.pname.trim() || undefined,
        price,
      });
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/products/${ean}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcodes: barcodesOut }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save barcodes.");
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save barcodes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">Pack barcodes</h3>
        <p className="mt-0.5 text-sm text-slate-500">{name}</p>
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          The single unit already uses the primary EAN{" "}
          <span className="font-mono text-slate-700">{ean}</span>. Add a separate
          barcode for each pack size (e.g. pack of 10, pack of 5).
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-2.5">
              <div className="flex items-center gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  value={r.ean}
                  onChange={(e) => update(i, { ean: e.target.value })}
                  placeholder="Pack EAN (scan or type)…"
                  inputMode="numeric"
                  autoComplete="off"
                />
                <input
                  className={`${inputClass} w-24`}
                  value={r.size}
                  onChange={(e) => update(i, { size: e.target.value })}
                  placeholder="pcs e.g 10"
                  type="number"
                  min={1}
                  step={1}
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  title="Remove row"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  value={r.pname}
                  onChange={(e) => update(i, { pname: e.target.value })}
                  placeholder="Pack name (optional, e.g. listing title)"
                  autoComplete="off"
                />
                <div className="flex w-32 items-center gap-1">
                  <span className="text-sm text-slate-400">₹</span>
                  <input
                    className={inputClass}
                    value={r.price}
                    onChange={(e) => update(i, { price: e.target.value })}
                    placeholder="price"
                    type="number"
                    min={0}
                    step="0.01"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-3 text-sm font-medium text-brand-600 hover:underline"
        >
          + Add pack barcode
        </button>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save barcodes"}
          </button>
        </div>
      </div>
    </div>
  );
}
