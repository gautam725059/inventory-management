"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";
import type { ReleaseOrder } from "@/lib/types";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<ReleaseOrder["status"], { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  dispatched: { label: "Dispatched", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-700 border-red-200" },
};

function StatusBadge({ status }: { status: ReleaseOrder["status"] }) {
  const b = STATUS_BADGE[status] ?? STATUS_BADGE.dispatched;
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${b.cls}`}>
      {b.label}
    </span>
  );
}

export default function ReleaseOrdersPage() {
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  const [ros, setRos] = useState<ReleaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/release-orders");
      if (!res.ok) throw new Error("Failed to load release orders.");
      setRos(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(ro: ReleaseOrder) {
    if (!confirm(`Delete ${ro.roNumber}? (Stock already dispatched is NOT restored.)`)) return;
    try {
      const res = await fetch(`/api/release-orders/${ro.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  }

  async function decide(ro: ReleaseOrder, action: "approve" | "reject") {
    if (action === "approve" && !confirm(`Approve ${ro.roNumber}? This dispatches the stock.`)) return;
    if (action === "reject" && !confirm(`Reject ${ro.roNumber}?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/release-orders/${ro.id}`, {
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

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
        ← Dashboard
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Release Orders</h1>
          <p className="mt-1 text-sm text-slate-500">
            Incoming platform orders (Blinkit etc.). Admin ROs dispatch stock
            right away; staff ROs stay <strong>pending</strong> until an admin
            approves them.
          </p>
        </div>
        <Link
          href="/release-orders/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          + New RO
        </Link>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : ros.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No release orders yet. Click <strong>+ New RO</strong> to process one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">RO No.</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Net Amount</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ros.map((ro) => (
                <tr key={ro.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-medium">
                    <Link href={`/release-orders/${ro.id}`} className="text-brand-600 hover:underline">
                      {ro.roNumber}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{ro.date}</td>
                  <td className="px-4 py-3 text-slate-700">{ro.source || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={ro.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{ro.items.length}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {ro.totalQuantity.toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                    {inr(ro.netAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {isAdmin && ro.status === "pending" && (
                        <>
                          <button
                            onClick={() => decide(ro, "approve")}
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => decide(ro, "reject")}
                            className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <Link
                        href={`/release-orders/${ro.id}`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        View
                      </Link>
                      {isAdmin && (
                        <button
                          onClick={() => remove(ro)}
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
