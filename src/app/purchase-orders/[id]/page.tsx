"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import type { PurchaseOrder } from "@/lib/types";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<PurchaseOrder["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/purchase-orders/${id}`);
      if (!res.ok) throw new Error("Failed to load PO.");
      setPo(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function decide(action: "approve" | "reject") {
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

  async function remove() {
    if (!po || !confirm(`Delete ${po.poNumber}? This can't be undone.`)) return;
    const res = await fetch(`/api/purchase-orders/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/purchase-orders");
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-slate-400">Loading…</div>;
  }
  if (!po) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center text-sm text-slate-500">
        {error || "PO not found."}{" "}
        <Link href="/purchase-orders" className="font-medium text-brand-600 hover:underline">
          Back
        </Link>
      </div>
    );
  }

  const th = "border border-slate-300 px-2 py-1.5 text-left font-semibold";
  const td = "border border-slate-300 px-2 py-1.5";

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      {/* Print rules: hide app chrome + action buttons when printing. */}
      <style>{`@media print { aside, header.sticky, .no-print { display: none !important; } .md\\:pl-64 { padding-left: 0 !important; } }`}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/purchase-orders" className="text-sm font-medium text-brand-600 hover:underline">
          ← Purchase Orders
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            🖨 Print / PDF
          </button>
          {isAdmin && po.status === "pending" && (
            <>
              <button onClick={() => decide("approve")} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">
                Approve
              </button>
              <button onClick={() => decide("reject")} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50">
                Reject
              </button>
            </>
          )}
          {isAdmin && (
            <button onClick={remove} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50">
              Delete
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="no-print mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* The printable document */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Purchase Order</h1>
            <p className="mt-0.5 font-mono text-lg text-slate-700">{po.poNumber}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_BADGE[po.status]}`}>
            {po.status.toUpperCase()}
          </span>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Date</div>
            <div className="font-medium text-slate-900">{po.date}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Vendor</div>
            <div className="font-medium text-slate-900">{po.vendorName}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Invoice No.</div>
            <div className="font-medium text-slate-900">{po.invoiceNumber || "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Raised by</div>
            <div className="font-medium text-slate-900">{po.requestedByName || "—"}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className={th}>HSN Code</th>
                <th className={th}>Product UPC</th>
                <th className={th}>Product Code</th>
                <th className={th}>Product Description</th>
                <th className={`${th} text-right`}>Carton Size</th>
                <th className={`${th} text-right`}>Carton Qty</th>
                <th className={`${th} text-right`}>Total Qty</th>
                <th className={`${th} text-right`}>Rate</th>
                <th className={`${th} text-right`}>Tax %</th>
                <th className={`${th} text-right`}>Tax Amt</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={`${th} text-right`}>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((it, i) => (
                <tr key={i} className="text-slate-700">
                  <td className={td}>{it.hsnCode || "—"}</td>
                  <td className={`${td} font-mono`}>{it.ean}</td>
                  <td className={td}>{it.productCode || "—"}</td>
                  <td className={td}>{it.description}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.cartonSize}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.cartonQty}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.totalQty.toLocaleString("en-IN")}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.rate}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.taxRate}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.taxAmount}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.amount}</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>
                    {it.totalAmount.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold text-slate-900">
                <td className={`${td} text-right`} colSpan={11}>
                  Grand Total
                </td>
                <td className={`${td} text-right tabular-nums`}>
                  {inr(po.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {po.status === "pending" && (
          <p className="mt-4 text-sm text-amber-700">
            ⏳ Awaiting admin approval. The order is confirmed only after an admin
            approves it.
          </p>
        )}
      </div>
    </div>
  );
}
