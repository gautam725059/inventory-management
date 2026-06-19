"use client";

import { useEffect, useMemo, useState } from "react";
import type { WarehouseStockLine, Customer } from "@/lib/types";

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

/** What a scanned/typed EAN resolves to. */
interface Resolved {
  line: WarehouseStockLine;
  size: number; // pieces per pack the barcode stands for
}

/** Today's date as YYYY-MM-DD, for the date input default. */
function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function packLabel(size: number): string {
  return size === 1 ? "single" : `pack of ${size}`;
}

/** Form for dispatching stock out by scanning a pack barcode. Each pack size
 *  (single / pack of 10 / pack of 5 …) can have its own EAN; scanning it
 *  auto-fills the product and pack size. */
export default function StockOutForm({
  warehouseId,
  lines,
  onDispatched,
  onError,
}: Props) {
  const inStock = lines.filter((l) => l.quantity > 0);

  const [ean, setEan] = useState("");
  const [packs, setPacks] = useState("");
  const [chosenSize, setChosenSize] = useState(1);
  const [date, setDate] = useState(today());
  const [invoiceNo, setInvoiceNo] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setCustomers(Array.isArray(list) ? list : []))
      .catch(() => setCustomers([]));
  }, []);

  // Map every known barcode (primary EAN → single, plus each pack barcode) to
  // the stock line and pack size it represents. Explicit pack barcodes win over
  // the implicit "primary EAN = single" entry.
  const barcodeMap = useMemo(() => {
    const map = new Map<string, Resolved>();
    for (const line of inStock) {
      if (!map.has(line.ean)) map.set(line.ean, { line, size: 1 });
    }
    for (const line of inStock) {
      for (const b of line.barcodes) {
        map.set(b.ean, { line, size: b.size });
      }
    }
    return map;
  }, [inStock]);

  const trimmedEan = ean.trim();
  const resolved = trimmedEan ? barcodeMap.get(trimmedEan) : undefined;
  const unknownEan = trimmedEan.length > 0 && !resolved;

  // When the master/primary EAN is entered, let the user pick the pack size to
  // dispatch: single, plus any pack sizes set on the product. A scanned *pack*
  // barcode already carries its own size, so it skips the chooser.
  const isPrimaryScan = !!resolved && trimmedEan === resolved.line.ean;
  const sizeOptions = isPrimaryScan
    ? [1, ...(resolved.line.comboSizes ?? []).filter((s) => s > 1)]
    : resolved
      ? [resolved.size]
      : [];
  const showSizeChooser = isPrimaryScan && sizeOptions.length > 1;

  // Reset the chosen size whenever a different product resolves.
  useEffect(() => {
    setChosenSize(1);
  }, [resolved?.line.ean, isPrimaryScan]);

  const packCount = Number(packs) || 0;
  const size = isPrimaryScan ? chosenSize : resolved?.size ?? 0;
  const pieces = size * packCount;
  const available = resolved?.line.quantity ?? 0;
  const remaining = available - pieces;
  const overdraw = pieces > available;

  const canSubmit =
    !!resolved &&
    packCount > 0 &&
    !overdraw &&
    date.trim().length > 0 &&
    invoiceNo.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolved) return;
    setSaving(true);
    onError("");
    try {
      const res = await fetch(`/api/warehouses/${warehouseId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ean: resolved.line.ean,
          unitSize: size,
          packs: packCount,
          date: date.trim(),
          invoiceNo: invoiceNo.trim(),
          referenceNo: referenceNo.trim() || undefined,
          customerName: customerName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to dispatch goods.");
      }
      setEan("");
      setPacks("");
      setInvoiceNo("");
      setReferenceNo("");
      setCustomerName("");
      // Keep the date — usually several dispatches share one date.
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
      <h3 className="mb-1 text-base font-semibold text-slate-900">
        Stock out — scan a pack barcode
      </h3>
      <p className="mb-4 text-sm text-slate-500">
        Scan or type the EAN. Each pack size (single, pack of 10, pack of 5 …)
        has its own barcode and auto-fills the pack size.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="ean" className={labelClass}>
            Scan / enter EAN *
          </label>
          <input
            id="ean"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            inputMode="numeric"
            autoComplete="off"
            className={inputClass}
            value={ean}
            onChange={(e) => setEan(e.target.value)}
            placeholder="Scan barcode or type the EAN…"
            required
          />
          {resolved && (
            <p className="mt-1.5 text-xs text-slate-500">
              <span className="font-semibold text-slate-900">
                {resolved.line.name}
              </span>{" "}
              · <span className="font-medium text-brand-700">{packLabel(size)}</span>
              {size > 1 && ` (${size} pcs each)`} ·{" "}
              {resolved.line.quantity.toLocaleString()} pcs in stock
            </p>
          )}
          {unknownEan && (
            <p className="mt-1.5 text-xs text-amber-600">
              No product in this warehouse matches that barcode. Register it on
              the product in the Catalog.
            </p>
          )}
        </div>

        {showSizeChooser && (
          <div className="sm:col-span-2">
            <label htmlFor="packSize" className={labelClass}>
              Pack size *
            </label>
            <select
              id="packSize"
              className={inputClass}
              value={chosenSize}
              onChange={(e) => setChosenSize(Number(e.target.value))}
            >
              {sizeOptions.map((s) => (
                <option key={s} value={s}>
                  {s === 1 ? "Single (1 pc)" : `Pack of ${s} (${s} pcs each)`}
                </option>
              ))}
            </select>
          </div>
        )}

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
            disabled={!resolved}
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
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={!resolved}
            required
          />
        </div>

        <div>
          <label htmlFor="invoiceNo" className={labelClass}>
            Invoice no. *
          </label>
          <input
            id="invoiceNo"
            type="text"
            autoComplete="off"
            className={inputClass}
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="e.g. INV-2026-001"
            disabled={!resolved}
            required
          />
        </div>

        <div>
          <label htmlFor="referenceNo" className={labelClass}>
            Reference no. (optional)
          </label>
          <input
            id="referenceNo"
            type="text"
            autoComplete="off"
            className={inputClass}
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="e.g. PO / order ref"
            disabled={!resolved}
          />
        </div>

        <div>
          <label htmlFor="customerName" className={labelClass}>
            Customer (optional)
          </label>
          <input
            id="customerName"
            type="text"
            autoComplete="off"
            list="customer-list"
            className={inputClass}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Pick or type a customer…"
            disabled={!resolved}
          />
          <datalist id="customer-list">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>
      </div>

      {resolved && packCount > 0 && (
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
          pieces ({packCount} × {packLabel(resolved.size)}).{" "}
          {overdraw
            ? `Only ${available} in stock.`
            : `${remaining} pieces will remain.`}
        </p>
      )}

      <div className="mt-5">
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Dispatching…" : "Dispatch (stock out)"}
        </button>
      </div>
    </form>
  );
}
