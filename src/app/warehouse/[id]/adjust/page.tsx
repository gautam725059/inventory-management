"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";
import type { WarehouseDetail } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

const REASONS = [
  "Damage",
  "Expiry",
  "Count correction",
  "Theft / Loss",
  "Found / Recount",
  "Other",
];

export default function AdjustPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { me, loading: meLoading } = useMe();
  const allowed = !!me; // any logged-in user can submit
  const isAdmin = me?.role === "admin";

  const [detail, setDetail] = useState<WarehouseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [ean, setEan] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/warehouses/${id}`);
      if (!res.ok) throw new Error("Failed to load warehouse.");
      setDetail(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, allowed]);

  const selected = useMemo(
    () => detail?.lines.find((l) => l.ean === ean),
    [detail, ean]
  );

  const amt = Number(amount) || 0;
  const delta = direction === "remove" ? -amt : amt;
  const current = selected?.quantity ?? 0;
  const resulting = current + delta;
  const invalid = amt <= 0 || resulting < 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/warehouses/${id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ean,
          delta,
          reason,
          note: note || undefined,
          productName: selected?.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to adjust stock.");
      }
      if (data.pending) {
        setSuccess(
          "Adjustment submitted for admin approval. Stock will update once an admin approves it."
        );
      } else {
        setSuccess(
          `Stock adjusted (${delta > 0 ? "+" : ""}${delta}). Reason: ${reason}.`
        );
      }
      setEan("");
      setAmount("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock.");
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
          Stock adjustment is restricted to admins.
        </div>
      </div>
    );
  }

  const inStock = detail?.lines ?? [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/warehouse/${id}`} className="text-sm font-medium text-brand-600 hover:underline">
        ← {detail?.name ?? "Warehouse"}
      </Link>

      <header className="mt-3 mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Add / Remove Inventory
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Add (+) or remove (−) stock with a reason (damage, expiry, recount…).
          Every change is logged with your name and reason.
        </p>
        {!isAdmin && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            🔒 Your adjustments need <strong>admin approval</strong> before stock
            changes. They&rsquo;ll appear in the admin panel as a pending request.
          </div>
        )}
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
          No stock in this warehouse to adjust.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="product" className={labelClass}>Product *</label>
              <select
                id="product"
                className={inputClass}
                value={ean}
                onChange={(e) => setEan(e.target.value)}
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
              <label htmlFor="direction" className={labelClass}>Direction *</label>
              <select
                id="direction"
                className={inputClass}
                value={direction}
                onChange={(e) => setDirection(e.target.value as "add" | "remove")}
                disabled={!selected}
              >
                <option value="remove">Remove (−)</option>
                <option value="add">Add (+)</option>
              </select>
            </div>

            <div>
              <label htmlFor="amount" className={labelClass}>Amount (pieces) *</label>
              <input
                id="amount"
                type="number"
                min={1}
                step={1}
                className={inputClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1"
                disabled={!selected}
                required
              />
            </div>

            <div>
              <label htmlFor="reason" className={labelClass}>Reason *</label>
              <select
                id="reason"
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!selected}
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
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

          {selected && amt > 0 && (
            <p
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                resulting < 0
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {current} {delta >= 0 ? "+" : "−"} {Math.abs(delta)} ={" "}
              <strong className={resulting < 0 ? "text-red-700" : "text-brand-700"}>
                {resulting}
              </strong>{" "}
              pieces.
              {resulting < 0 && " Can't go below zero."}
            </p>
          )}

          <div className="mt-5">
            <button
              type="submit"
              disabled={saving || !selected || invalid}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Submitting…"
                : isAdmin
                  ? "Apply adjustment"
                  : "Submit for approval"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
