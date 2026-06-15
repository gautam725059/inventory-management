"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import type { Movement } from "@/lib/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/warehouses/${id}/movements`);
        if (!res.ok) throw new Error("Failed to load history.");
        setMovements(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Link
        href={`/warehouse/${id}`}
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        ← Warehouse
      </Link>

      <header className="mt-3 mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Movement History
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every stock-in and stock-out, newest first.
          </p>
        </div>
        {movements.length > 0 && (
          <a
            href={`/api/warehouses/${id}/movements?format=csv`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ⬇ Export CSV
          </a>
        )}
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : movements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No movements yet. Stock-in and stock-out activity will appear here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Detail</th>
                <th className="px-4 py-3 text-right font-medium">Pieces</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {formatDate(m.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {m.type === "in" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Stock In
                      </span>
                    ) : (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                        Stock Out
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{m.name}</div>
                    <div className="text-xs text-slate-400">EAN {m.ean}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {m.type === "out" && m.unitSize
                      ? `${m.packs} × ${m.unitSize === 1 ? "single" : `pack of ${m.unitSize}`}`
                      : "Bulk receipt"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-bold tabular-nums ${
                      m.type === "in" ? "text-emerald-600" : "text-brand-600"
                    }`}
                  >
                    {m.type === "in" ? "+" : "−"}
                    {m.quantity.toLocaleString()}
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
