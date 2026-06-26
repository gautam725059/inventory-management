"use client";

import { useState } from "react";
import { useChannel } from "@/lib/useChannel";
import type { ProductPurchaseHistory } from "@/lib/types";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Dashboard widget: type a product code (EAN in e-com; 12NC / ASIN in B2B) and
 *  see every purchase (stock-in) of it in the active channel — date, quantity,
 *  cost price, vendor and bill. */
export default function PurchaseSearch() {
  const channel = useChannel();
  const codeLabel = channel === "b2b" ? "12NC / ASIN" : "EAN";

  const [code, setCode] = useState("");
  const [result, setResult] = useState<ProductPurchaseHistory | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    setError(null);
    setNotFound(false);
    setResult(null);
    try {
      const res = await fetch(`/api/purchase-history?code=${encodeURIComponent(c)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed.");
      if (!data.found) setNotFound(true);
      else setResult(data as ProductPurchaseHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        🔎 Purchase history lookup
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Enter a product&rsquo;s {codeLabel} to see when, how many and at what rate
        it was purchased.
      </p>

      <form onSubmit={search} className="mt-4 flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={`Scan or type the ${codeLabel}…`}
          inputMode={channel === "b2b" ? "text" : "numeric"}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notFound && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No product with this {codeLabel} in this channel.
        </div>
      )}

      {result && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-900">{result.name}</div>
              <div className="font-mono text-xs text-slate-400">{result.ean}</div>
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold tabular-nums text-slate-900">
                {result.totalQuantity.toLocaleString()} pcs bought
              </div>
              {result.totalValue > 0 && (
                <div className="tabular-nums text-slate-500">
                  total {inr(result.totalValue)}
                </div>
              )}
            </div>
          </div>

          {result.entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No purchases recorded for this product yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Warehouse</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Rate</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Vendor</th>
                    <th className="px-3 py-2 font-medium">Bill</th>
                  </tr>
                </thead>
                <tbody>
                  {result.entries.map((e, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{e.date}</td>
                      <td className="px-3 py-2 text-slate-600">{e.warehouseName}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">
                        {e.quantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {typeof e.price === "number" ? inr(e.price) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {typeof e.amount === "number" ? inr(e.amount) : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{e.vendorName || "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{e.bill || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
