"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import type { ReleaseOrder, ROFulfillment, WarehouseDetail } from "@/lib/types";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Per-line pipeline display + the next action. */
const FULFILL: Record<
  ROFulfillment,
  { label: string; cls: string; next: ROFulfillment | null; nextLabel: string }
> = {
  packed: { label: "📦 Packed", cls: "bg-amber-100 text-amber-700", next: "dispatched", nextLabel: "🚚 Dispatch" },
  dispatched: { label: "🚚 Dispatched", cls: "bg-blue-100 text-blue-700", next: "delivered", nextLabel: "✅ Deliver" },
  delivered: { label: "✅ Delivered", cls: "bg-emerald-100 text-emerald-700", next: null, nextLabel: "" },
};

export default function ReleaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";

  const [ro, setRo] = useState<ReleaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyLine, setBusyLine] = useState<number | null>(null);
  const [tick, setTick] = useState(0); // bumps to re-sync editable inputs after a save
  // Physical on-hand stock per product in the RO's warehouse (for the Available column).
  const [stockByEan, setStockByEan] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/release-orders/${id}`);
        if (!res.ok) throw new Error("Failed to load RO.");
        setRo(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Once we know the RO's warehouse, load its stock to show "Available" per line.
  useEffect(() => {
    if (!ro?.warehouseId) return;
    fetch(`/api/warehouses/${ro.warehouseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WarehouseDetail | null) => {
        const m: Record<string, number> = {};
        for (const l of d?.lines ?? []) m[l.ean] = l.quantity;
        setStockByEan(m);
      })
      .catch(() => {});
  }, [ro?.warehouseId, ro?.items]);

  async function remove() {
    if (!ro || !confirm(`Delete ${ro.roNumber}? (Dispatched stock is NOT restored.)`)) return;
    const res = await fetch(`/api/release-orders/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/release-orders");
  }

  async function decide(action: "approve" | "reject") {
    if (!ro) return;
    if (action === "approve" && !confirm(`Approve ${ro.roNumber}? Stock will be reserved (packed).`)) return;
    if (action === "reject" && !confirm(`Reject ${ro.roNumber}?`)) return;
    setError(null);
    const res = await fetch(`/api/release-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setRo(d);
    else setError(d.error || "Failed.");
  }

  /** A line can be edited until it has been dispatched. */
  function canEditLine(it: ReleaseOrder["items"][number]): boolean {
    return (
      ro?.status !== "rejected" &&
      it.fulfillment !== "dispatched" &&
      it.fulfillment !== "delivered"
    );
  }

  /** Save an edited quantity / dispatch qty for one line (only if it changed). */
  async function saveLine(
    index: number,
    patch: { quantity?: string; dispatchQty?: string },
    oldValue: number
  ) {
    const raw = patch.quantity ?? patch.dispatchQty ?? "";
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 0 || n === oldValue) {
      setTick((t) => t + 1); // reset the input to the current value
      return;
    }
    setError(null);
    const body: Record<string, number> = { itemIndex: index };
    if (patch.quantity !== undefined) body.quantity = n;
    if (patch.dispatchQty !== undefined) body.dispatchQty = n;
    const res = await fetch(`/api/release-orders/${id}/line`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setRo(d);
    else setError(d.error || "Failed to save.");
    setTick((t) => t + 1); // re-sync inputs to the saved values
  }

  /** Move one line forward: packed → dispatched (deducts stock) → delivered. */
  async function advanceLine(index: number, to: ROFulfillment) {
    if (to === "dispatched" && !confirm("Dispatch this item? Stock will be removed from the warehouse.")) return;
    setError(null);
    setBusyLine(index);
    try {
      const res = await fetch(`/api/release-orders/${id}/line`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndex: index, to }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setRo(d);
      else setError(d.error || "Failed.");
    } finally {
      setBusyLine(null);
    }
  }

  if (loading) return <div className="py-20 text-center text-sm text-slate-400">Loading…</div>;
  if (!ro) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center text-sm text-slate-500">
        {error || "RO not found."}{" "}
        <Link href="/release-orders" className="font-medium text-brand-600 hover:underline">Back</Link>
      </div>
    );
  }

  const th = "border border-slate-300 px-2 py-1.5 text-left font-semibold";
  const td = "border border-slate-300 px-2 py-1.5";

  // Per-line pipeline progress (only meaningful once approved).
  const counts = ro.items.reduce(
    (a, it) => {
      const f = it.fulfillment;
      if (f === "packed") a.packed++;
      else if (f === "dispatched") a.dispatched++;
      else if (f === "delivered") a.delivered++;
      return a;
    },
    { packed: 0, dispatched: 0, delivered: 0 }
  );
  const inPipeline = ro.status === "approved";

  const badge =
    ro.status === "pending"
      ? { text: "PENDING", cls: "bg-amber-100 text-amber-700" }
      : ro.status === "rejected"
        ? { text: "REJECTED", cls: "bg-red-100 text-red-700" }
        : ro.status === "approved"
          ? counts.delivered === ro.items.length
            ? { text: "DELIVERED", cls: "bg-emerald-100 text-emerald-700" }
            : counts.packed === 0
              ? { text: "DISPATCHED", cls: "bg-blue-100 text-blue-700" }
              : { text: "IN PROGRESS", cls: "bg-indigo-100 text-indigo-700" }
          : { text: "DISPATCHED", cls: "bg-emerald-100 text-emerald-700" };

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <style>{`@media print { aside, header.sticky, .no-print { display: none !important; } .md\\:pl-64 { padding-left: 0 !important; } }`}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/release-orders" className="text-sm font-medium text-brand-600 hover:underline">← Release Orders</Link>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">🖨 Print / PDF</button>
          {isAdmin && ro.status === "pending" && (
            <>
              <button onClick={() => decide("approve")} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">Approve</button>
              <button onClick={() => decide("reject")} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50">Reject</button>
            </>
          )}
          {isAdmin && (
            <button onClick={remove} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50">Delete</button>
          )}
        </div>
      </div>

      {error && (
        <div className="no-print mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Release Order</h1>
            <p className="mt-0.5 font-mono text-lg text-slate-700">{ro.roNumber}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${badge.cls}`}>{badge.text}</span>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><div className="text-xs uppercase tracking-wide text-slate-400">Date</div><div className="font-medium text-slate-900">{ro.date}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-slate-400">Source</div><div className="font-medium text-slate-900">{ro.source || "—"}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-slate-400">Customer</div><div className="font-medium text-slate-900">{ro.customerName || "—"}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-slate-400">By</div><div className="font-medium text-slate-900">{ro.createdByName || "—"}</div></div>
        </div>

        {inPipeline && (
          <div className="no-print mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-600">Fulfillment:</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">📦 {counts.packed} packed</span>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">🚚 {counts.dispatched} dispatched</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">✅ {counts.delivered} delivered</span>
            <span className="ml-auto text-xs text-slate-400">Move each item forward in the table below.</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className={th}>#</th>
                <th className={th}>Item Code</th>
                <th className={th}>Product UPC</th>
                <th className={th}>Product Description</th>
                <th className={`${th} text-right`}>GST %</th>
                <th className={`${th} text-right`}>Tax Amt</th>
                <th className={`${th} text-right`}>Landing Rate</th>
                <th className={`${th} text-right`}>Quantity</th>
                <th className={`${th} text-right`}>Available</th>
                <th className={`${th} text-right no-print`}>Dispatch Qty</th>
                <th className={`${th} text-right`}>MRP</th>
                <th className={`${th} text-right`}>Total Amount</th>
                {inPipeline && <th className={`${th} no-print`}>Status</th>}
              </tr>
            </thead>
            <tbody>
              {ro.items.map((it, i) => (
                <tr key={i} className="text-slate-700">
                  <td className={td}>{i + 1}</td>
                  <td className={td}>{it.itemCode || "—"}</td>
                  <td className={`${td} font-mono`}>{it.ean}</td>
                  <td className={td}>{it.description}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.gstRate}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.taxAmount}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.landingRate}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {canEditLine(it) ? (
                      <input
                        key={`q-${i}-${tick}`}
                        type="number"
                        min={1}
                        defaultValue={it.quantity}
                        onBlur={(e) => saveLine(i, { quantity: e.target.value }, it.quantity)}
                        className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right text-xs tabular-nums outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-200"
                      />
                    ) : (
                      it.quantity
                    )}
                  </td>
                  <td
                    className={`${td} text-right tabular-nums ${
                      stockByEan[it.ean] !== undefined && stockByEan[it.ean] < it.quantity
                        ? "font-semibold text-red-600"
                        : "text-slate-600"
                    }`}
                    title={
                      stockByEan[it.ean] !== undefined && stockByEan[it.ean] < it.quantity
                        ? "Warehouse stock is less than the ordered quantity"
                        : ""
                    }
                  >
                    {stockByEan[it.ean] !== undefined ? stockByEan[it.ean].toLocaleString("en-IN") : "—"}
                  </td>
                  <td className={`${td} text-right tabular-nums no-print`}>
                    {canEditLine(it) ? (
                      <input
                        key={`d-${i}-${tick}`}
                        type="number"
                        min={0}
                        defaultValue={it.dispatchQty ?? it.quantity}
                        onBlur={(e) => saveLine(i, { dispatchQty: e.target.value }, it.dispatchQty ?? it.quantity)}
                        className="w-16 rounded border border-slate-300 bg-brand-50/40 px-1.5 py-0.5 text-right text-xs font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-200"
                      />
                    ) : (
                      (it.dispatchQty ?? it.quantity)
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{it.mrp ?? "—"}</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>{it.totalAmount.toLocaleString("en-IN")}</td>
                  {inPipeline && (
                    <td className={`${td} no-print`}>
                      {(() => {
                        const f = it.fulfillment ?? "packed";
                        const info = FULFILL[f];
                        return (
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${info.cls}`}>{info.label}</span>
                            {info.next && (
                              <button
                                onClick={() => advanceLine(i, info.next!)}
                                disabled={busyLine === i}
                                className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                              >
                                {busyLine === i ? "…" : info.nextLabel}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-slate-900">
                <td className={`${td} text-right`} colSpan={7}>Total Qty</td>
                <td className={`${td} text-right tabular-nums`}>{ro.totalQuantity.toLocaleString("en-IN")}</td>
                <td className={td}></td>
                <td className={`${td} no-print`}></td>
                <td className={td}></td>
                <td className={`${td} text-right tabular-nums`}>{inr(ro.totalAmount)}</td>
                {inPipeline && <td className={`${td} no-print`}></td>}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Total Amount</span><span className="tabular-nums">{inr(ro.totalAmount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Cart Discount</span><span className="tabular-nums">{inr(ro.cartDiscount)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-slate-900"><span>Net Amount</span><span className="tabular-nums">{inr(ro.netAmount)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
