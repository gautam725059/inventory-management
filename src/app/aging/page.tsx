"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";
import type { StockAgingRow } from "@/lib/types";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const OPTIONS = [30, 60, 90];

export default function StockAgingPage() {
  const { me, loading: meLoading } = useMe();
  const isAdmin = me?.role === "admin";
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<StockAgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/aging?days=${d}`);
      if (!res.ok) throw new Error("Failed to load stock aging.");
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load(days);
  }, [days, load, isAdmin]);

  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  if (meLoading) {
    return <div className="py-20 text-center text-sm text-slate-400">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-sm px-5 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Stock Aging</h1>
        <p className="mt-2 text-sm text-slate-500">Admin only.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
        ← Dashboard
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            🕒 Stock Aging
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Products sitting in stock without a sale — likely damaged, dead, or
            stuck. Go check &amp; clear them.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {OPTIONS.map((o) => (
            <button
              key={o}
              onClick={() => setDays(o)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                days === o
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {o}+ days
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="font-semibold text-amber-800">
            {rows.length} product{rows.length === 1 ? "" : "s"} stuck {days}+ days
          </span>
          <span className="tabular-nums text-amber-800">
            {totalQty.toLocaleString()} pcs · {inr(totalValue)} tied up
          </span>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          🎉 Nothing stuck {days}+ days — all stock is moving.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Warehouse</th>
                <th className="px-4 py-3 text-right font-medium">In stock</th>
                <th className="px-4 py-3 font-medium">Last sold</th>
                <th className="px-4 py-3 text-right font-medium">Idle</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ean} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <div className="font-mono text-xs text-slate-400">{r.ean}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.warehouses.join(", ")}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                    {r.quantity.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {r.neverSold ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        never sold
                      </span>
                    ) : (
                      <span className="text-slate-600">{r.lastOutDate}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.idleDays >= 90
                          ? "bg-red-100 text-red-700"
                          : r.idleDays >= 60
                            ? "bg-orange-100 text-orange-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {r.idleDays} days
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {inr(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
