"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";
import BarChart from "@/components/BarChart";
import type { Report } from "@/lib/types";

function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function num(n: number): string {
  return n.toLocaleString("en-IN");
}
function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(mo) - 1]} ${y.slice(2)}`;
}

export default function ReportsPage() {
  const { me, loading: meLoading } = useMe();
  const canView = me?.role === "admin" || me?.role === "manager";

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(`/api/reports?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to load report.");
      setReport(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  if (meLoading) {
    return <div className="py-20 text-center text-sm text-slate-400">Loading…</div>;
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-sm px-5 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Reports</h1>
        <p className="mt-2 text-sm text-slate-500">
          {me ? `Your role (${me.role}) can't view reports.` : "Sign in as an admin or manager."}
        </p>
        <div className="mt-5">
          <Link href="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            ← Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const topProducts = (report?.byProduct ?? []).filter((p) => p.revenue > 0).slice(0, 6);
  const maxRev = Math.max(1, ...topProducts.map((p) => p.revenue));

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
        ← Dashboard
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sales, purchases, profit margin, and inventory value.
          </p>
        </div>
      </header>

      {/* Range filter */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <button
          onClick={load}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Apply
        </button>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            All time
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading || !report ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card label="Sales revenue" value={inr(report.sales.revenue)} sub={`${num(report.sales.units)} units · ${report.sales.count} sales`} tone="emerald" />
            <Card
              label="Profit"
              value={inr(report.sales.profit)}
              sub={`${report.sales.marginPct.toFixed(1)}% margin`}
              tone={report.sales.profit >= 0 ? "emerald" : "red"}
            />
            <Card label="Purchases" value={inr(report.purchases.spend)} sub={`${num(report.purchases.units)} units · ${report.purchases.count} receipts`} tone="brand" />
            <Card label="Stock value" value={inr(report.inventory.totalProductValue)} sub={`cost ${inr(report.inventory.totalPurchaseValue)}`} tone="slate" />
          </div>

          {/* Monthly chart */}
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Monthly sales vs purchases</h2>
            <BarChart
              groups={report.monthly.map((m) => ({
                label: monthLabel(m.month),
                values: [m.salesRevenue, m.purchaseSpend],
              }))}
              series={[
                { label: "Sales revenue", color: "bg-emerald-500" },
                { label: "Purchase spend", color: "bg-brand-500" },
              ]}
              format={inr}
            />
          </section>

          {/* Top products */}
          <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Top products by revenue</h2>
            {topProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No sales in this period.</p>
            ) : (
              <div className="space-y-2">
                {topProducts.map((p) => (
                  <div key={p.ean} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-sm text-slate-700" title={p.name}>
                      {p.name}
                    </div>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full rounded bg-emerald-500"
                        style={{ width: `${(p.revenue / maxRev) * 100}%` }}
                      />
                    </div>
                    <div className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {inr(p.revenue)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* By-product table */}
          <section className="mb-8">
            <h2 className="mb-3 text-base font-semibold text-slate-900">By product</h2>
            {report.byProduct.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                No activity in this period.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 text-right font-medium">Sold</th>
                      <th className="px-4 py-3 text-right font-medium">Revenue</th>
                      <th className="px-4 py-3 text-right font-medium">Purchased</th>
                      <th className="px-4 py-3 text-right font-medium">Spend</th>
                      <th className="px-4 py-3 text-right font-medium">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byProduct.map((p) => (
                      <tr key={p.ean} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="text-xs text-slate-400">EAN {p.ean}</div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{num(p.soldUnits)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{inr(p.revenue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{num(p.purchasedUnits)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-brand-700">{inr(p.spend)}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${p.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {inr(p.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Low stock */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
              Low stock
              {report.lowStock.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {report.lowStock.length}
                </span>
              )}
            </h2>
            {report.lowStock.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                Nothing below reorder level. 🎉
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-amber-50 text-left text-xs uppercase tracking-wide text-amber-700">
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium">Warehouse</th>
                      <th className="px-4 py-3 text-right font-medium">On hand</th>
                      <th className="px-4 py-3 text-right font-medium">Reorder at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lowStock.map((r) => (
                      <tr key={`${r.ean}-${r.warehouseName}`} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{r.name}</div>
                          <div className="text-xs text-slate-400">EAN {r.ean}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{r.warehouseName}</td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-amber-700">{num(r.quantity)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">{num(r.reorderLevel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "brand" | "slate" | "red";
}) {
  const tones: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    brand: "border-brand-200 bg-brand-50 text-brand-700",
    slate: "border-slate-200 bg-white text-slate-900",
    red: "border-red-200 bg-red-50 text-red-700",
  };
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs opacity-70">{sub}</p>
    </div>
  );
}
