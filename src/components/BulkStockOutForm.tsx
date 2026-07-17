"use client";

import { useEffect, useMemo, useState } from "react";
import { useChannel, scanWord } from "@/lib/useChannel";
import type { WarehouseStockLine, Customer, ReleaseOrder } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

// Max product lines per bulk stock-out. B2B dispatches are larger, so allow 20;
// Shanya (e-com) stays at 10.
const MAX_LINES_BY_CHANNEL = { b2b: 20, ecom: 10 } as const;

interface Props {
  warehouseId: string;
  lines: WarehouseStockLine[];
  onPacked: (ro: ReleaseOrder) => void | Promise<void>;
  onError: (message: string) => void;
}

interface Row {
  ean: string;
  chosenSize: number; // size chosen when the master EAN was entered
  packs: string;
}

function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function packLabel(size: number): string {
  return size === 1 ? "single" : `pack of ${size}`;
}

const EMPTY_ROW: Row = { ean: "", chosenSize: 1, packs: "" };

/** Pack several products at once for dispatch (up to 10 lines in Shanya, 20 in
 *  B2B). Packing reserves the stock as a "Counter" release order — it is not
 *  deducted until each line is dispatched from that RO. */
export default function BulkStockOutForm({
  warehouseId,
  lines,
  onPacked,
  onError,
}: Props) {
  const channel = useChannel();
  const maxLines = MAX_LINES_BY_CHANNEL[channel];
  const inStock = useMemo(() => lines.filter((l) => l.quantity > 0), [lines]);

  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
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

  // Map every known barcode → { line, size } (primary EAN = single).
  const barcodeMap = useMemo(() => {
    const map = new Map<string, { line: WarehouseStockLine; size: number }>();
    for (const line of inStock) if (!map.has(line.ean)) map.set(line.ean, { line, size: 1 });
    for (const line of inStock) for (const b of line.barcodes) map.set(b.ean, { line, size: b.size });
    return map;
  }, [inStock]);

  /** Resolve a single row to its product line, pack size and pieces. */
  function resolveRow(row: Row) {
    const ean = row.ean.trim();
    const hit = ean ? barcodeMap.get(ean) : undefined;
    const isPrimary = !!hit && ean === hit.line.ean;
    const sizeOptions = isPrimary
      ? [1, ...(hit.line.comboSizes ?? []).filter((s) => s > 1)]
      : hit
        ? [hit.size]
        : [];
    const size = isPrimary
      ? sizeOptions.includes(row.chosenSize)
        ? row.chosenSize
        : 1
      : hit?.size ?? 0;
    const packs = Number(row.packs) || 0;
    return { hit, isPrimary, sizeOptions, size, packs, pieces: size * packs };
  }

  // Combined pieces requested per product (to flag over-drawing across lines).
  const requested = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of rows) {
      const { hit, pieces } = resolveRow(row);
      if (hit && pieces > 0) m.set(hit.line.ean, (m.get(hit.line.ean) ?? 0) + pieces);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, barcodeMap]);

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => (rs.length >= maxLines ? rs : [...rs, { ...EMPTY_ROW }]));
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  const validRows = rows.filter((r) => {
    const { hit, pieces } = resolveRow(r);
    return hit && pieces > 0;
  });
  const anyOverdraw = [...requested.entries()].some(([ean, need]) => {
    const free = inStock.find((l) => l.ean === ean)?.available ?? 0;
    return need > free;
  });
  const totalPieces = [...requested.values()].reduce((a, b) => a + b, 0);

  const canSubmit =
    validRows.length > 0 && !anyOverdraw && date.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    onError("");
    try {
      // Pack = reserve as a Counter RO. Pack-size × packs collapses to pieces.
      const payloadLines = validRows.map((r) => {
        const { hit, size, packs } = resolveRow(r);
        return { ean: hit!.line.ean, quantity: size * packs };
      });
      const res = await fetch(`/api/warehouses/${warehouseId}/pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: date.trim(),
          reference: invoiceNo.trim() || referenceNo.trim() || undefined,
          customerName: customerName.trim() || undefined,
          lines: payloadLines,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to pack.");
      }
      setRows([{ ...EMPTY_ROW }]);
      setInvoiceNo("");
      setReferenceNo("");
      setCustomerName("");
      await onPacked(data as ReleaseOrder);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to pack.");
    } finally {
      setSaving(false);
    }
  }

  if (inStock.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Nothing in stock to pack.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-base font-semibold text-slate-900">
        Pack for dispatch — up to {maxLines} products
      </h3>
      <p className="mb-4 text-sm text-slate-500">
        Reserve products for an order. Stock is set aside as{" "}
        <strong>packed</strong>; it leaves the warehouse when you dispatch each
        line from the release order.
      </p>

      {/* Shared details */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>Reference / Bill no.</label>
          <input className={inputClass} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="optional" autoComplete="off" />
        </div>
        <div>
          <label className={labelClass}>Reference no.</label>
          <input className={inputClass} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="optional" autoComplete="off" />
        </div>
        <div>
          <label className={labelClass}>Customer</label>
          <input list="bulk-customers" className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="optional" autoComplete="off" />
          <datalist id="bulk-customers">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Product lines */}
      <div className="space-y-2">
        {rows.map((row, i) => {
          const { hit, isPrimary, sizeOptions, size, pieces } = resolveRow(row);
          const unknown = row.ean.trim().length > 0 && !hit;
          const have = hit ? requested.get(hit.line.ean) ?? 0 : 0;
          const overdraw = hit ? have > hit.line.available : false;
          return (
            <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-5">
                  <label className={labelClass}>Scan / enter {scanWord(channel)}</label>
                  <input
                    className={inputClass}
                    inputMode={channel === "b2b" ? "text" : "numeric"}
                    autoComplete="off"
                    value={row.ean}
                    onChange={(e) => setRow(i, { ean: e.target.value, chosenSize: 1 })}
                    placeholder={`Scan barcode or type ${scanWord(channel)}…`}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelClass}>Pack size</label>
                  {isPrimary && sizeOptions.length > 1 ? (
                    <select
                      className={inputClass}
                      value={size}
                      onChange={(e) => setRow(i, { chosenSize: Number(e.target.value) })}
                    >
                      {sizeOptions.map((s) => (
                        <option key={s} value={s}>
                          {s === 1 ? "Single" : `Pack of ${s}`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className={`${inputClass} bg-slate-100`} value={hit ? packLabel(size) : "—"} readOnly tabIndex={-1} />
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Packs</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={inputClass}
                    value={row.packs}
                    onChange={(e) => setRow(i, { packs: e.target.value })}
                    placeholder="1"
                    disabled={!hit}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 sm:col-span-2">
                  <span className={`text-sm tabular-nums ${overdraw ? "font-semibold text-red-600" : "text-slate-600"}`}>
                    {pieces > 0 ? `${pieces} pcs` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 transition hover:bg-white disabled:opacity-40"
                    aria-label="Remove line"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {hit && (
                <p className={`mt-1 text-xs ${overdraw ? "text-red-600" : "text-slate-500"}`}>
                  <span className="font-medium text-slate-700">{hit.line.name}</span> ·{" "}
                  {hit.line.available.toLocaleString()} available
                  {hit.line.packed > 0 && ` (${hit.line.packed.toLocaleString()} packed)`}
                  {overdraw && ` · over by ${have - hit.line.available}`}
                </p>
              )}
              {unknown && (
                <p className="mt-1 text-xs text-amber-600">No product in this warehouse matches that barcode.</p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= maxLines}
        className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-slate-50 disabled:opacity-40"
      >
        + Add product {rows.length >= maxLines ? `(max ${maxLines})` : ""}
      </button>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="text-sm text-slate-600">
          {validRows.length} product{validRows.length === 1 ? "" : "s"} ·{" "}
          <strong className={anyOverdraw ? "text-red-600" : "text-slate-900"}>
            {totalPieces.toLocaleString()}
          </strong>{" "}
          pieces
          {anyOverdraw && <span className="ml-2 text-red-600">— some lines exceed available</span>}
        </div>
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Packing…" : `📦 Pack ${validRows.length || ""} for dispatch`}
        </button>
      </div>
    </form>
  );
}
