"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import WarehouseCard from "@/components/WarehouseCard";
import type { WarehouseSummary } from "@/lib/types";

export default function Dashboard() {
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/warehouses");
        if (!res.ok) throw new Error("Failed to load warehouses.");
        setWarehouses(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalUnits = warehouses.reduce((s, w) => s + w.totalUnits, 0);
  const totalLines = warehouses.reduce((s, w) => s + w.skuCount, 0);
  const totalLow = warehouses.reduce((s, w) => s + w.lowStockCount, 0);

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Warehouse Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Select a warehouse to receive stock and manage combos.
          </p>
        </div>
        <Link
          href="/catalog"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          📚 Product Catalog
        </Link>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          <div className="mb-8 flex flex-col gap-5 rounded-xl border border-brand-100 bg-linear-to-br from-brand-600 to-brand-700 p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/15 text-3xl">
                📦
              </span>
              <div>
                <p className="text-sm font-medium text-brand-100">
                  Total stock — all warehouses
                </p>
                <p className="mt-1 text-4xl font-bold tabular-nums">
                  {totalUnits.toLocaleString()}{" "}
                  <span className="text-xl font-medium text-brand-100">pieces</span>
                </p>
              </div>
            </div>
            <div className="flex gap-8 sm:gap-10">
              <div>
                <p className="text-3xl font-bold tabular-nums">{warehouses.length}</p>
                <p className="text-xs uppercase tracking-wide text-brand-100">
                  Warehouses
                </p>
              </div>
              <div>
                <p className="text-3xl font-bold tabular-nums">{totalLines}</p>
                <p className="text-xs uppercase tracking-wide text-brand-100">
                  Stock lines
                </p>
              </div>
              <div>
                <p className="text-3xl font-bold tabular-nums">
                  {totalLow}
                </p>
                <p className="text-xs uppercase tracking-wide text-brand-100">
                  Low stock
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {warehouses.map((w) => (
              <WarehouseCard key={w.id} warehouse={w} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
