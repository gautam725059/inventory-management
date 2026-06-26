"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";
import type { PurchaseOrder } from "@/lib/types";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<PurchaseOrder["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  received: "bg-sky-100 text-sky-700",
};
const STATUS_LABEL: Record<PurchaseOrder["status"], string> = {
  pending: "pending",
  confirmed: "on the way",
  rejected: "rejected",
  received: "received",
};

export default function PurchaseOrdersPage() {
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/purchase-orders");
      if (!res.ok) throw new Error("Failed to load purchase orders.");
      setPos(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  }

  async function stockIn(po: PurchaseOrder) {
    setError(null);
    if (!po.warehouseId) {
      setError(
        `${po.poNumber}: open the PO (View) to choose a warehouse before stocking in.`
      );
      return;
    }
    if (
      !confirm(
        `Stock in all ${po.items.length} item(s) of ${po.poNumber} into inventory?`
      )
    )
      return;
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "receive", warehouseId: po.warehouseId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  }

  async function remove(po: PurchaseOrder) {
    if (!confirm(`Delete ${po.poNumber}? This can't be undone.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  }

  const pendingCount = pos.filter((p) => p.status === "pending").length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
        ← Dashboard
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            Purchase Orders
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Raise orders to vendors. Staff orders need admin approval before they
            are confirmed.
          </p>
        </div>
        <Link
          href="/purchase-orders/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          + New PO
        </Link>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : pos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No purchase orders yet. Click <strong>+ New PO</strong> to raise one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">PO No.</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 text-right font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Grand Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr key={po.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-medium text-slate-900">
                    <Link href={`/purchase-orders/${po.id}`} className="text-brand-600 hover:underline">
                      {po.poNumber}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{po.date}</td>
                  <td className="px-4 py-3 text-slate-700">{po.vendorName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {po.items.length}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                    {inr(po.grandTotal)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[po.status]}`}>
                      {po.status === "confirmed" && (
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </span>
                      )}
                      {STATUS_LABEL[po.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/purchase-orders/${po.id}`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        View
                      </Link>
                      {isAdmin && po.status === "pending" && (
                        <>
                          <button
                            onClick={() => decide(po.id, "approve")}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => decide(po.id, "reject")}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {isAdmin && po.status === "confirmed" && (
                        <button
                          onClick={() => stockIn(po)}
                          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
                        >
                          📥 Stock In
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => remove(po)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
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
