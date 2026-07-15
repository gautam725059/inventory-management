"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import { useChannel, codeWord } from "@/lib/useChannel";
import type {
  WarehouseSummary,
  WarehouseDetail,
  WarehouseStockLine,
  Customer,
} from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const MAX_LINES = 20;

function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

interface Row {
  ean: string;
  quantity: string;
}
const EMPTY_ROW: Row = { ean: "", quantity: "" };

export default function NewReleaseOrderPage() {
  const router = useRouter();
  const { me } = useMe();
  const channel = useChannel();
  const isAdmin = me?.role === "admin";

  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [stockLines, setStockLines] = useState<WarehouseStockLine[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [date, setDate] = useState(today());
  const [source, setSource] = useState("Blinkit");
  const [customerName, setCustomerName] = useState("");
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Warehouses + customers once.
  useEffect(() => {
    fetch("/api/warehouses")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setWarehouses(list);
        if (list[0]) setWarehouseId(list[0].id);
      })
      .catch(() => {});
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => setCustomers([]));
  }, []);

  // Stock lines for the selected warehouse (name + available for resolution).
  useEffect(() => {
    if (!warehouseId) return;
    fetch(`/api/warehouses/${warehouseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WarehouseDetail | null) => setStockLines(d?.lines ?? []))
      .catch(() => setStockLines([]));
  }, [warehouseId]);

  // Any scannable code (primary EAN/SKU or a pack barcode) → its stock line.
  const byCode = useMemo(() => {
    const m = new Map<string, WarehouseStockLine>();
    for (const l of stockLines) {
      m.set(l.ean, l);
      for (const b of l.barcodes ?? []) m.set(b.ean, l);
    }
    return m;
  }, [stockLines]);

  // Combined pieces requested per product, to flag over-reserving across lines.
  const requested = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const line = byCode.get(r.ean.trim());
      const qty = Number(r.quantity) || 0;
      if (line && qty > 0) m.set(line.ean, (m.get(line.ean) ?? 0) + qty);
    }
    return m;
  }, [rows, byCode]);

  function resolveRow(r: Row) {
    const line = byCode.get(r.ean.trim());
    const qty = Number(r.quantity) || 0;
    const need = line ? requested.get(line.ean) ?? 0 : 0;
    const overdraw = !!line && need > line.available;
    return { line, qty, overdraw };
  }

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => (rs.length >= MAX_LINES ? rs : [...rs, { ...EMPTY_ROW }]));
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  const validRows = rows.filter((r) => {
    const { line, qty } = resolveRow(r);
    return line && qty > 0;
  });
  const anyUnknown = rows.some((r) => r.ean.trim().length > 0 && !byCode.get(r.ean.trim()));
  const anyOverdraw = rows.some((r) => resolveRow(r).overdraw);
  const totalQty = [...requested.values()].reduce((a, b) => a + b, 0);

  const canSubmit =
    !!warehouseId &&
    !!date.trim() &&
    validRows.length > 0 &&
    !anyUnknown &&
    !anyOverdraw;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const lines = validRows.map((r) => ({
        ean: byCode.get(r.ean.trim())!.ean,
        quantity: Number(r.quantity) || 0,
      }));
      const res = await fetch("/api/release-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: date.trim(),
          source: source.trim() || undefined,
          warehouseId,
          customerName: customerName.trim() || undefined,
          lines,
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
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/release-orders" className="text-sm font-medium text-brand-600 hover:underline">
        ← Release Orders
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Release Order</h1>
        <p className="mt-1 text-sm text-slate-500">
          Scan or type each product and its quantity. On approval the stock is
          reserved as <strong>packed</strong>, then the team dispatches &amp;
          delivers each item.
        </p>
      </header>

      {!isAdmin && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Note: staff release orders need <strong>admin approval</strong>.
          Nothing is reserved until an admin approves.
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* Header fields */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
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
            <input className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Blinkit" autoComplete="off" />
          </div>
          <div>
            <label className={labelClass}>Customer</label>
            <input list="ro-customers" className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="optional" autoComplete="off" />
            <datalist id="ro-customers">
              {customers.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Product lines */}
        <div className="space-y-2">
          {rows.map((row, i) => {
            const { line, qty, overdraw } = resolveRow(row);
            const unknown = row.ean.trim().length > 0 && !line;
            return (
              <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
                  <div className="sm:col-span-7">
                    <label className={labelClass}>Scan / enter {codeWord(channel)}</label>
                    <input
                      className={inputClass}
                      inputMode={channel === "b2b" ? "text" : "numeric"}
                      autoComplete="off"
                      value={row.ean}
                      onChange={(e) => setRow(i, { ean: e.target.value })}
                      placeholder={`Scan barcode or type ${codeWord(channel)}…`}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={labelClass}>Quantity</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className={inputClass}
                      value={row.quantity}
                      onChange={(e) => setRow(i, { quantity: e.target.value })}
                      placeholder="1"
                      disabled={!line}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 sm:col-span-2">
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
                {line && (
                  <p className={`mt-1 text-xs ${overdraw ? "text-red-600" : "text-slate-500"}`}>
                    <span className="font-medium text-slate-700">{line.name}</span> ·{" "}
                    {line.available.toLocaleString()} available
                    {line.packed > 0 && ` (${line.packed.toLocaleString()} already packed)`}
                    {overdraw && ` · over by ${(requested.get(line.ean) ?? 0) - line.available}`}
                  </p>
                )}
                {unknown && (
                  <p className="mt-1 text-xs text-amber-600">
                    No product in this warehouse matches that {codeWord(channel)}.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= MAX_LINES}
          className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          + Add product {rows.length >= MAX_LINES ? `(max ${MAX_LINES})` : ""}
        </button>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="text-sm text-slate-600">
            {validRows.length} product{validRows.length === 1 ? "" : "s"} ·{" "}
            <strong className={anyOverdraw ? "text-red-600" : "text-slate-900"}>
              {totalQty.toLocaleString()}
            </strong>{" "}
            pieces
            {anyOverdraw && <span className="ml-2 text-red-600">— some lines exceed available</span>}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !canSubmit}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : isAdmin
                ? "Create RO (reserve as packed)"
                : "Submit for approval"}
          </button>
        </div>
      </div>
    </div>
  );
}
