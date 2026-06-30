"use client";

import { useState } from "react";
import { useChannel, codeWord } from "@/lib/useChannel";
import type { ProductPurchaseHistory } from "@/lib/types";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

interface Row {
  code: string;
  status: "found" | "notfound" | "error";
  data?: ProductPurchaseHistory;
  error?: string;
}

/** Dashboard widget: enter one or more product codes (EAN in e-com; SKU / ASIN
 *  in B2B) and see every purchase (stock-in) of each — date, quantity, cost
 *  price, vendor and bill — all together. */
export default function PurchaseSearch() {
  const channel = useChannel();
  const label = codeWord(channel);

  const [codes, setCodes] = useState<string[]>([""]);
  const [results, setResults] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setCode(i: number, value: string) {
    setCodes((cs) => cs.map((c, idx) => (idx === i ? value : c)));
  }
  function addCode() {
    setCodes((cs) => [...cs, ""]);
  }
  function removeCode(i: number) {
    setCodes((cs) => (cs.length === 1 ? cs : cs.filter((_, idx) => idx !== i)));
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    // Unique, non-empty codes (preserve order).
    const list = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const rows = await Promise.all(
        list.map(async (code): Promise<Row> => {
          try {
            const res = await fetch(
              `/api/purchase-history?code=${encodeURIComponent(code)}`
            );
            const data = await res.json();
            if (!res.ok) return { code, status: "error", error: data.error || "Failed." };
            if (!data.found) return { code, status: "notfound" };
            return { code, status: "found", data: data as ProductPurchaseHistory };
          } catch {
            return { code, status: "error", error: "Request failed." };
          }
        })
      );
      setResults(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  const found = results.filter((r) => r.status === "found" && r.data);
  const grandQty = found.reduce((s, r) => s + (r.data?.totalQuantity ?? 0), 0);
  const grandValue = found.reduce((s, r) => s + (r.data?.totalValue ?? 0), 0);

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        🔎 Purchase history lookup
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Enter one or more {label}s to see when, how many and at what rate each was
        purchased. Use <strong>+</strong> to add more.
      </p>

      <form onSubmit={search} className="mt-4 space-y-2">
        {codes.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={c}
              onChange={(e) => setCode(i, e.target.value)}
              placeholder={`${label} #${i + 1}`}
              inputMode={channel === "b2b" ? "text" : "numeric"}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={() => removeCode(i)}
              disabled={codes.length === 1}
              aria-label="Remove"
              className="rounded-lg border border-slate-200 px-3 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={addCode}
            className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-slate-50"
          >
            + Add {label}
          </button>
          <button
            type="submit"
            disabled={busy || codes.every((c) => !c.trim())}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-5 space-y-4">
          {/* Combined summary across all found products */}
          {found.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
              <span className="font-semibold text-brand-800">
                {found.length} product{found.length === 1 ? "" : "s"} found
              </span>
              <span className="tabular-nums text-brand-800">
                Total: <strong>{grandQty.toLocaleString()}</strong> pcs
                {grandValue > 0 && <> · {inr(grandValue)}</>}
              </span>
            </div>
          )}

          {results.map((r, i) => {
            if (r.status === "notfound") {
              return (
                <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                  <span className="font-mono">{r.code}</span> — no product with this {label} in this channel.
                </div>
              );
            }
            if (r.status === "error" || !r.data) {
              return (
                <div key={i} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  <span className="font-mono">{r.code}</span> — {r.error || "failed"}.
                </div>
              );
            }
            const d = r.data;
            return (
              <div key={i} className="rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div>
                    <div className="font-semibold text-slate-900">{d.name}</div>
                    <div className="font-mono text-xs text-slate-400">{d.ean}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold tabular-nums text-slate-900">
                      {d.totalQuantity.toLocaleString()} pcs bought
                    </div>
                    {d.totalValue > 0 && (
                      <div className="tabular-nums text-slate-500">total {inr(d.totalValue)}</div>
                    )}
                  </div>
                </div>

                {d.entries.length === 0 ? (
                  <div className="px-4 py-4 text-center text-sm text-slate-500">
                    No purchases recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
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
                        {d.entries.map((e, j) => (
                          <tr key={j} className="border-b border-slate-100 last:border-0">
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
            );
          })}
        </div>
      )}
    </section>
  );
}
