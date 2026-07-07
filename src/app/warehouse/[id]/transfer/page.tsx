"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useMe, canApprove } from "@/lib/useMe";
import { useChannel, codeLabel, codeWord } from "@/lib/useChannel";
import type { WarehouseDetail, WarehouseSummary } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

export default function TransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { me, loading: meLoading } = useMe();
  const channel = useChannel();
  const allowed = canApprove(me);

  const [detail, setDetail] = useState<WarehouseDetail | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [ean, setEan] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [dRes, wRes] = await Promise.all([
        fetch(`/api/warehouses/${id}`),
        fetch(`/api/warehouses`),
      ]);
      if (!dRes.ok || !wRes.ok) throw new Error("Failed to load data.");
      setDetail(await dRes.json());
      setWarehouses(await wRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, allowed]);

  // Resolve the typed/scanned code to an in-stock line — by primary EAN/12NC or
  // any pack barcode (e.g. an ASIN). Name then auto-fills from the match.
  const selected = useMemo(() => {
    const e = ean.trim();
    if (!e) return undefined;
    return detail?.lines.find(
      (l) => l.quantity > 0 && (l.ean === e || (l.barcodes ?? []).some((b) => b.ean === e))
    );
  }, [detail, ean]);
  const noMatch = ean.trim().length > 0 && !selected;
  const destinations = warehouses.filter((w) => w.id !== id);

  const qty = Number(quantity) || 0;
  const available = selected?.quantity ?? 0;
  const remaining = available - qty;
  const overdraw = qty > available;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/transfers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromWarehouseId: id,
          toWarehouseId,
          ean: selected?.ean ?? ean.trim(),
          quantity: qty,
          note: note || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to transfer stock.");
      }
      const toName =
        destinations.find((w) => w.id === toWarehouseId)?.name ?? "destination";
      setSuccess(`Transferred ${qty} pcs to ${toName}.`);
      setEan("");
      setQuantity("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transfer stock.");
    } finally {
      setSaving(false);
    }
  }

  if (meLoading) {
    return <div className="py-20 text-center text-sm text-slate-400">Loading…</div>;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <Link href={`/warehouse/${id}`} className="text-sm font-medium text-brand-600 hover:underline">
          ← Warehouse
        </Link>
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Stock transfer is restricted to admins.
        </div>
      </div>
    );
  }

  const inStock = detail?.lines.filter((l) => l.quantity > 0) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/warehouse/${id}`} className="text-sm font-medium text-brand-600 hover:underline">
        ← {detail?.name ?? "Warehouse"}
      </Link>

      <header className="mt-3 mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Transfer Stock
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Move pieces from {detail?.name ?? "this warehouse"} to another
          warehouse. Logged in both warehouses&apos; history.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {inStock.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No stock in this warehouse to transfer.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ean" className={labelClass}>
                {codeLabel(channel)} *
              </label>
              <input
                id="ean"
                className={inputClass}
                value={ean}
                onChange={(e) => setEan(e.target.value)}
                placeholder={`Scan or type the ${codeWord(channel)}…`}
                inputMode={channel === "b2b" ? "text" : "numeric"}
                list="transfer-eans"
                autoComplete="off"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                required
              />
              <datalist id="transfer-eans">
                {inStock.map((l) => (
                  <option key={l.ean} value={l.ean}>
                    {l.name} ({l.quantity} pcs)
                  </option>
                ))}
              </datalist>
              {noMatch && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  No stock with this {codeWord(channel)} in this warehouse.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="product-name" className={labelClass}>
                Product name
              </label>
              <input
                id="product-name"
                className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-700`}
                value={selected?.name ?? ""}
                readOnly
                tabIndex={-1}
                placeholder="Auto-fills from the code"
              />
              {selected && (
                <p className="mt-1 text-xs text-emerald-600">
                  ✓ {selected.quantity} pcs in stock
                </p>
              )}
            </div>

            <div>
              <label htmlFor="dest" className={labelClass}>Destination warehouse *</label>
              <select
                id="dest"
                className={inputClass}
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
                disabled={!selected}
                required
              >
                <option value="">Select destination…</option>
                {destinations.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="quantity" className={labelClass}>Quantity (pieces) *</label>
              <input
                id="quantity"
                type="number"
                min={1}
                step={1}
                className={inputClass}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
                disabled={!selected}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="note" className={labelClass}>Note (optional)</label>
              <input
                id="note"
                className={inputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reference / detail"
                disabled={!selected}
              />
            </div>
          </div>

          {selected && qty > 0 && (
            <p
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                overdraw
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              Moving <strong className={overdraw ? "text-red-700" : "text-brand-700"}>{qty}</strong> pcs.{" "}
              {overdraw
                ? `Only ${available} in stock here.`
                : `${remaining} will remain in ${detail?.name}.`}
            </p>
          )}

          <div className="mt-5">
            <button
              type="submit"
              disabled={saving || !selected || !toWarehouseId || qty <= 0 || overdraw}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Transferring…" : "Transfer stock"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
