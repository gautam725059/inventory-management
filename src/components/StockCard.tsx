import type { WarehouseStockLine } from "@/lib/types";

/** One product's stock in a warehouse, with its combo-pack breakdown. */
export default function StockCard({ line }: { line: WarehouseStockLine }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <div className="font-semibold text-slate-900">{line.name}</div>
          <div className="mt-0.5 text-xs text-slate-400">EAN {line.ean}</div>
        </div>
        <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold tabular-nums text-slate-700">
          {line.quantity.toLocaleString()} pcs
        </span>
      </div>

      {line.combos.length === 0 ? (
        <p className="text-sm text-slate-400">
          No combo sizes set. Add them when receiving stock (e.g. 10, 5).
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {line.combos.map((c) => (
            <div
              key={c.size}
              className="flex min-w-23 flex-col rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="text-xl font-bold tabular-nums text-emerald-600">
                {c.packs}
              </span>
              <span className="text-xs text-slate-500">packs of {c.size}</span>
              {c.leftover > 0 && (
                <span className="mt-0.5 text-xs text-brand-600">
                  +{c.leftover} loose
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
