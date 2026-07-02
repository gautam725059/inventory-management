"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import ComboOutForm from "@/components/ComboOutForm";
import BulkStockOutForm from "@/components/BulkStockOutForm";
import StockCard from "@/components/StockCard";
import type { WarehouseDetail } from "@/lib/types";

export default function StockOutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [detail, setDetail] = useState<WarehouseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<"product" | "combo">("product");

  async function load() {
    try {
      const res = await fetch(`/api/warehouses/${id}`);
      if (!res.ok) throw new Error("Failed to load warehouse.");
      setDetail(await res.json());
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

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Link
        href={`/warehouse/${id}`}
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        ← {detail?.name ?? "Warehouse"}
      </Link>

      <header className="mt-3 mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Stock Out — packs
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Dispatch from {detail?.name ?? "this warehouse"} as packs or singles.
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

      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => setMode("product")}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
            mode === "product"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          📤 Products
        </button>
        <button
          onClick={() => setMode("combo")}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
            mode === "combo"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          🎁 Combo
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : mode === "product" ? (
        <BulkStockOutForm
          warehouseId={id}
          lines={detail?.lines ?? []}
          onDispatched={async () => {
            setSuccess("Stock dispatched.");
            await load();
          }}
          onError={(message) => {
            setError(message || null);
            if (message) setSuccess(null);
          }}
        />
      ) : (
        <ComboOutForm
          warehouseId={id}
          lines={detail?.lines ?? []}
          onDispatched={async () => {
            setSuccess("Combo dispatched.");
            await load();
          }}
          onError={(message) => {
            setError(message || null);
            if (message) setSuccess(null);
          }}
        />
      )}

      <div className="mb-4 mt-8 flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-slate-900">
          Remaining stock
        </h3>
        {detail && (
          <span className="text-sm text-slate-500">
            {detail.lines.length} products ·{" "}
            {detail.totalUnits.toLocaleString()} pieces
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : !detail || detail.lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No stock in this warehouse.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {detail.lines.map((line) => (
            <StockCard key={line.ean} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}
