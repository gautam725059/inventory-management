"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import StockCard from "@/components/StockCard";
import { useMe, canApprove } from "@/lib/useMe";
import type { WarehouseDetail } from "@/lib/types";

export default function WarehousePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { me } = useMe();
  const canManage = canApprove(me);

  const [detail, setDetail] = useState<WarehouseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const lines = detail?.lines ?? [];
    if (!q) return lines;
    return lines.filter(
      (l) => l.name.toLowerCase().includes(q) || l.ean.includes(q)
    );
  }, [detail, query]);

  async function load() {
    try {
      const res = await fetch(`/api/warehouses/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to load warehouse.");
      setDetail(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Warehouse not found.{" "}
          <Link href="/" className="font-medium text-brand-600 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Link
        href="/"
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        ← Dashboard
      </Link>

      <header className="mt-3 mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {detail?.name ?? "Warehouse"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{detail?.location}</p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href={`/warehouse/${id}/stock-in`}
          className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-2xl">
            📥
          </span>
          <span>
            <span className="block font-semibold text-slate-900">Stock In</span>
            <span className="mt-0.5 block text-sm text-slate-500">
              Receive bulk goods
            </span>
          </span>
        </Link>
        <Link
          href={`/warehouse/${id}/stock-out`}
          className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-2xl">
            📤
          </span>
          <span>
            <span className="block font-semibold text-slate-900">Stock Out</span>
            <span className="mt-0.5 block text-sm text-slate-500">
              Dispatch packs / singles
            </span>
          </span>
        </Link>
        <Link
          href={`/warehouse/${id}/history`}
          className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-2xl">
            📜
          </span>
          <span>
            <span className="block font-semibold text-slate-900">History</span>
            <span className="mt-0.5 block text-sm text-slate-500">
              All stock movements
            </span>
          </span>
        </Link>

        {canManage && (
          <>
            <Link
              href={`/warehouse/${id}/adjust`}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-2xl">
                ⚖️
              </span>
              <span>
                <span className="block font-semibold text-slate-900">Adjust</span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  Correct stock (+/−)
                </span>
              </span>
            </Link>
            <Link
              href={`/warehouse/${id}/transfer`}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50 text-2xl">
                🔁
              </span>
              <span>
                <span className="block font-semibold text-slate-900">Transfer</span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  Move to another warehouse
                </span>
              </span>
            </Link>
          </>
        )}
      </div>

      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-slate-900">
          Stock in this warehouse
        </h3>
        {detail && (
          <span className="text-sm text-slate-500">
            {detail.lines.length} products ·{" "}
            {detail.totalUnits.toLocaleString()} pieces
          </span>
        )}
      </div>

      {detail && detail.lines.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or EAN…"
            className="min-w-50 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <a
            href={`/api/warehouses/${id}?format=csv`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ⬇ Export CSV
          </a>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : !detail || detail.lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No stock yet. Receive your first product above.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No products match your search.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((line) => (
            <StockCard
              key={line.ean}
              line={line}
              warehouseId={id}
              onChanged={load}
              onError={(message) => setError(message || null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
