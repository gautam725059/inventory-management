"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import type { ReleaseOrder } from "@/lib/types";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

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

  async function remove() {
    if (!ro || !confirm(`Delete ${ro.roNumber}? (Dispatched stock is NOT restored.)`)) return;
    const res = await fetch(`/api/release-orders/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/release-orders");
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

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <style>{`@media print { aside, header.sticky, .no-print { display: none !important; } .md\\:pl-64 { padding-left: 0 !important; } }`}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/release-orders" className="text-sm font-medium text-brand-600 hover:underline">← Release Orders</Link>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">🖨 Print / PDF</button>
          {isAdmin && (
            <button onClick={remove} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50">Delete</button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Release Order</h1>
            <p className="mt-0.5 font-mono text-lg text-slate-700">{ro.roNumber}</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">DISPATCHED</span>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><div className="text-xs uppercase tracking-wide text-slate-400">Date</div><div className="font-medium text-slate-900">{ro.date}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-slate-400">Source</div><div className="font-medium text-slate-900">{ro.source || "—"}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-slate-400">Customer</div><div className="font-medium text-slate-900">{ro.customerName || "—"}</div></div>
          <div><div className="text-xs uppercase tracking-wide text-slate-400">By</div><div className="font-medium text-slate-900">{ro.createdByName || "—"}</div></div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className={th}>#</th>
                <th className={th}>Item Code</th>
                <th className={th}>Product UPC</th>
                <th className={th}>Product Description</th>
                <th className={th}>Grammage</th>
                <th className={`${th} text-right`}>GST %</th>
                <th className={`${th} text-right`}>Tax Amt</th>
                <th className={`${th} text-right`}>Landing Rate</th>
                <th className={`${th} text-right`}>Quantity</th>
                <th className={`${th} text-right`}>MRP</th>
                <th className={`${th} text-right`}>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {ro.items.map((it, i) => (
                <tr key={i} className="text-slate-700">
                  <td className={td}>{i + 1}</td>
                  <td className={td}>{it.itemCode || "—"}</td>
                  <td className={`${td} font-mono`}>{it.ean}</td>
                  <td className={td}>{it.description}</td>
                  <td className={td}>{it.grammage || "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.gstRate}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.taxAmount}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.landingRate}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.quantity}</td>
                  <td className={`${td} text-right tabular-nums`}>{it.mrp ?? "—"}</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>{it.totalAmount.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-slate-900">
                <td className={`${td} text-right`} colSpan={8}>Total Qty</td>
                <td className={`${td} text-right tabular-nums`}>{ro.totalQuantity.toLocaleString("en-IN")}</td>
                <td className={td}></td>
                <td className={`${td} text-right tabular-nums`}>{inr(ro.totalAmount)}</td>
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
