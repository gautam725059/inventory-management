"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComboView, WarehouseStockLine, Customer } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

interface Props {
  warehouseId: string;
  /** Current stock lines in this warehouse (to compute buildable combos). */
  lines: WarehouseStockLine[];
  onDispatched: () => void | Promise<void>;
  onError: (message: string) => void;
}

function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Stock-out for combos: pick (or scan) a combo, choose how many, and the
 *  server deducts each component product from this warehouse's stock. */
export default function ComboOutForm({
  warehouseId,
  lines,
  onDispatched,
  onError,
}: Props) {
  const [combos, setCombos] = useState<ComboView[]>([]);
  const [comboId, setComboId] = useState("");
  const [scan, setScan] = useState("");
  const [count, setCount] = useState("");
  const [date, setDate] = useState(today());
  const [invoiceNo, setInvoiceNo] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/combos")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setCombos(Array.isArray(list) ? list : []))
      .catch(() => setCombos([]));
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setCustomers(Array.isArray(list) ? list : []))
      .catch(() => setCustomers([]));
  }, []);

  const stockOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.ean, l.quantity);
    return m;
  }, [lines]);

  // A scanned combo barcode selects the combo.
  useEffect(() => {
    const s = scan.trim();
    if (!s) return;
    const hit = combos.find((c) => c.barcode && c.barcode === s);
    if (hit) setComboId(hit.id);
  }, [scan, combos]);

  const combo = combos.find((c) => c.id === comboId);

  // How many combos the least-stocked component allows.
  const buildable = useMemo(() => {
    if (!combo || combo.lines.length === 0) return 0;
    return Math.min(
      ...combo.lines.map((l) =>
        Math.floor((stockOf.get(l.ean) ?? 0) / l.quantity)
      )
    );
  }, [combo, stockOf]);

  const countNum = Number(count) || 0;
  const overdraw = countNum > buildable;
  const canSubmit =
    !!combo &&
    countNum > 0 &&
    !overdraw &&
    date.trim().length > 0 &&
    invoiceNo.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!combo) return;
    setSaving(true);
    onError("");
    try {
      const res = await fetch(`/api/warehouses/${warehouseId}/dispatch-combo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comboId: combo.id,
          combos: countNum,
          date: date.trim(),
          invoiceNo: invoiceNo.trim(),
          referenceNo: referenceNo.trim() || undefined,
          customerName: customerName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to dispatch combo.");
      }
      setScan("");
      setComboId("");
      setCount("");
      setInvoiceNo("");
      setReferenceNo("");
      setCustomerName("");
      await onDispatched();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to dispatch combo.");
    } finally {
      setSaving(false);
    }
  }

  if (combos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No combos yet. Create one on the{" "}
        <a href="/combos" className="font-medium text-brand-600 hover:underline">
          Combos
        </a>{" "}
        page first.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="mb-1 text-base font-semibold text-slate-900">
        Stock out — combo
      </h3>
      <p className="mb-4 text-sm text-slate-500">
        Scan a combo barcode or pick a combo. Each item is deducted from this
        warehouse&rsquo;s stock.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="comboScan" className={labelClass}>
            Scan combo barcode
          </label>
          <input
            id="comboScan"
            inputMode="numeric"
            autoComplete="off"
            className={inputClass}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            placeholder="Optional — or pick below"
          />
        </div>
        <div>
          <label htmlFor="combo" className={labelClass}>
            Combo *
          </label>
          <select
            id="combo"
            className={inputClass}
            value={comboId}
            onChange={(e) => setComboId(e.target.value)}
          >
            <option value="">Select a combo…</option>
            {combos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.price != null ? ` — ₹${c.price}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {combo && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Contains (per combo) · {buildable.toLocaleString()} buildable here
          </div>
          <ul className="space-y-1 text-sm">
            {combo.lines.map((l) => {
              const have = stockOf.get(l.ean) ?? 0;
              const need = l.quantity * countNum;
              const short = countNum > 0 && need > have;
              return (
                <li key={l.ean} className="flex items-center justify-between gap-3">
                  <span className="text-slate-700">
                    {l.name}{" "}
                    <span className="text-slate-400">×{l.quantity}</span>
                  </span>
                  <span
                    className={`tabular-nums ${short ? "font-semibold text-red-600" : "text-slate-500"}`}
                  >
                    {countNum > 0 ? `need ${need} · ` : ""}
                    {have} in stock
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="count" className={labelClass}>
            Number of combos *
          </label>
          <input
            id="count"
            type="number"
            min={1}
            step={1}
            className={inputClass}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="1"
            disabled={!combo}
            required
          />
        </div>
        <div>
          <label htmlFor="cdate" className={labelClass}>
            Date *
          </label>
          <input
            id="cdate"
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={!combo}
            required
          />
        </div>
        <div>
          <label htmlFor="cinvoice" className={labelClass}>
            Invoice no. *
          </label>
          <input
            id="cinvoice"
            type="text"
            autoComplete="off"
            className={inputClass}
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="e.g. INV-2026-001"
            disabled={!combo}
            required
          />
        </div>
        <div>
          <label htmlFor="cref" className={labelClass}>
            Reference no. (optional)
          </label>
          <input
            id="cref"
            type="text"
            autoComplete="off"
            className={inputClass}
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="e.g. PO / order ref"
            disabled={!combo}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ccustomer" className={labelClass}>
            Customer (optional)
          </label>
          <input
            id="ccustomer"
            type="text"
            autoComplete="off"
            list="combo-customer-list"
            className={inputClass}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Pick or type a customer…"
            disabled={!combo}
          />
          <datalist id="combo-customer-list">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>
      </div>

      {combo && countNum > 0 && (
        <p
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            overdraw
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          Dispatching{" "}
          <strong className={overdraw ? "text-red-700" : "text-brand-700"}>
            {countNum}
          </strong>{" "}
          combo(s){combo.price != null && ` · ₹${(combo.price * countNum).toLocaleString()}`}.{" "}
          {overdraw
            ? `Only ${buildable} can be built from current stock.`
            : `${(buildable - countNum).toLocaleString()} combos will still be buildable.`}
        </p>
      )}

      <div className="mt-5">
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Dispatching…" : "Dispatch combo (stock out)"}
        </button>
      </div>
    </form>
  );
}
