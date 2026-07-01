import Link from "next/link";
import type { WarehouseSummary } from "@/lib/types";

/** Clickable dashboard card summarizing one warehouse. */
export default function WarehouseCard({
  warehouse,
  value,
}: {
  warehouse: WarehouseSummary;
  /** Inventory value (₹) of this warehouse's stock. */
  value?: number;
}) {
  return (
    <Link
      href={`/warehouse/${warehouse.id}`}
      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-xl hover:shadow-brand-100"
    >
      {/* Top accent bar */}
      <span className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand-500 to-brand-700 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      {/* Soft corner glow on hover */}
      <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-brand-100 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-70" />

      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-2xl shadow-sm shadow-brand-200 ring-1 ring-white/30">
          🏬
        </span>
        <div className="flex-1">
          <h2 className="font-semibold text-slate-900">{warehouse.name}</h2>
          <p className="text-xs text-slate-500">{warehouse.location}</p>
        </div>
        {warehouse.lowStockCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
            {warehouse.lowStockCount} low
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
        <div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {warehouse.skuCount}
          </div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Products</div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums text-brand-700">
            {warehouse.totalUnits.toLocaleString()}
          </div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Total Pieces
          </div>
        </div>
      </div>

      {value !== undefined && (
        <div className="flex items-baseline justify-between rounded-xl bg-slate-50 px-3 py-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            Inventory Value
          </span>
          <span className="text-base font-bold tabular-nums text-slate-900">
            ₹{value.toLocaleString("en-IN")}
          </span>
        </div>
      )}

      <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
        Open warehouse
        <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
      </span>
    </Link>
  );
}
