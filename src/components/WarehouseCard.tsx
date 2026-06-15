import Link from "next/link";
import type { WarehouseSummary } from "@/lib/types";

/** Clickable dashboard card summarizing one warehouse. */
export default function WarehouseCard({ warehouse }: { warehouse: WarehouseSummary }) {
  return (
    <Link
      href={`/warehouse/${warehouse.id}`}
      className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-2xl">
          🏬
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{warehouse.name}</h2>
          <p className="text-xs text-slate-500">{warehouse.location}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-y border-slate-100 py-3">
        <div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {warehouse.skuCount}
          </div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Products</div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums text-slate-900">
            {warehouse.totalUnits.toLocaleString()}
          </div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Total Pieces
          </div>
        </div>
      </div>

      <span className="text-sm font-semibold text-brand-600 group-hover:underline">
        Open warehouse →
      </span>
    </Link>
  );
}
