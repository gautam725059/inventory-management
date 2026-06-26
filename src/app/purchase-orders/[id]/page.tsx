"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import type {
  PurchaseOrder,
  WarehouseSummary,
  Vendor,
  ProductCatalogEntry,
} from "@/lib/types";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const STATUS_BADGE: Record<PurchaseOrder["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  received: "bg-sky-100 text-sky-700",
};
const STATUS_LABEL: Record<PurchaseOrder["status"], string> = {
  pending: "PENDING",
  confirmed: "ON THE WAY",
  rejected: "REJECTED",
  received: "RECEIVED",
};

interface DraftLine {
  hsnCode: string;
  ean: string;
  productCode: string;
  description: string;
  cartonSize: string;
  cartonQty: string;
  rate: string;
  taxRate: string;
}

function toDraft(po: PurchaseOrder): DraftLine[] {
  return po.items.map((it) => ({
    hsnCode: it.hsnCode ?? "",
    ean: it.ean,
    productCode: it.productCode ?? "",
    description: it.description,
    cartonSize: String(it.cartonSize),
    cartonQty: String(it.cartonQty),
    rate: String(it.rate),
    taxRate: String(it.taxRate),
  }));
}

function calc(l: DraftLine) {
  const cartonSize = Math.max(0, Math.floor(Number(l.cartonSize) || 0));
  const cartonQty = Math.max(0, Math.floor(Number(l.cartonQty) || 0));
  const totalQty = cartonSize * cartonQty;
  const rate = Math.max(0, Number(l.rate) || 0);
  const taxRate = Math.max(0, Number(l.taxRate) || 0);
  const taxAmount = round2((rate * taxRate) / 100);
  const amount = round2(rate + taxAmount);
  const totalAmount = round2(amount * totalQty);
  return { totalQty, taxAmount, amount, totalAmount };
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

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
  const [busy, setBusy] = useState(false);

  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<ProductCatalogEntry[]>([]);

  // EAN / pack-barcode → product, for auto-filling the description on edit.
  const productByEan = useMemo(() => {
    const m = new Map<string, ProductCatalogEntry>();
    for (const p of products) {
      m.set(p.ean, p);
      for (const b of p.barcodes ?? []) m.set(b.ean, p);
    }
    return m;
  }, [products]);

  // Edit mode.
  const [editing, setEditing] = useState(false);
  const [dDate, setDDate] = useState("");
  const [dVendor, setDVendor] = useState("");
  const [dInvoice, setDInvoice] = useState("");
  const [dWarehouse, setDWarehouse] = useState("");
  const [dLines, setDLines] = useState<DraftLine[]>([]);

  // Stock-in warehouse picker (when the PO has no warehouse yet).
  const [pickWarehouse, setPickWarehouse] = useState("");

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
    fetch("/api/warehouses")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setWarehouses(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/vendors")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setVendors(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEdit() {
    if (!po) return;
    setDDate(po.date);
    setDVendor(po.vendorName);
    setDInvoice(po.invoiceNumber ?? "");
    setDWarehouse(po.warehouseId ?? "");
    setDLines(toDraft(po));
    setEditing(true);
    setError(null);
  }

  function setLine(i: number, patch: Partial<DraftLine>) {
    setDLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  /** On EAN change in edit mode, auto-fill the description from the catalog. */
  function editEan(i: number, ean: string) {
    const p = productByEan.get(ean.trim());
    setDLines((ls) =>
      ls.map((l, idx) =>
        idx === i ? { ...l, ean, description: p ? p.name : l.description } : l
      )
    );
  }
  function addLine() {
    setDLines((ls) => [
      ...ls,
      { hsnCode: "", ean: "", productCode: "", description: "", cartonSize: "", cartonQty: "", rate: "", taxRate: "18" },
    ]);
  }
  function removeLine(i: number) {
    setDLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));
  }

  async function saveEdit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dDate.trim(),
          vendorName: dVendor.trim(),
          invoiceNumber: dInvoice.trim(),
          warehouseId: dWarehouse || null,
          items: dLines
            .filter((l) => l.ean.trim() && l.description.trim() && calc(l).totalQty > 0)
            .map((l) => ({
              hsnCode: l.hsnCode.trim() || undefined,
              ean: l.ean.trim(),
              productCode: l.productCode.trim() || undefined,
              description: l.description.trim(),
              cartonSize: Number(l.cartonSize) || 0,
              cartonQty: Number(l.cartonQty) || 0,
              rate: Number(l.rate) || 0,
              taxRate: Number(l.taxRate) || 0,
            })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setPo(data);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function stockIn() {
    if (!po) return;
    const warehouseId = po.warehouseId || pickWarehouse;
    if (!warehouseId) {
      setError("Choose a warehouse to receive the goods into.");
      return;
    }
    if (
      !confirm(
        `Stock in all ${po.items.length} item(s) of ${po.poNumber} into inventory? This adds the goods to the warehouse.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchase-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "receive", warehouseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to stock in.");
      setPo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stock in.");
    } finally {
      setBusy(false);
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
  const warehouseName = (wid?: string) =>
    warehouses.find((w) => w.id === wid)?.name;
  const draftGrand = round2(dLines.reduce((s, l) => s + calc(l).totalAmount, 0));
  const canEdit = po.status === "pending" || po.status === "confirmed";

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <style>{`@media print { aside, header.sticky, .no-print { display: none !important; } .md\\:pl-64 { padding-left: 0 !important; } }`}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/purchase-orders" className="text-sm font-medium text-brand-600 hover:underline">
          ← Purchase Orders
        </Link>
        <div className="flex flex-wrap gap-2">
          {!editing && (
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              🖨 Print / PDF
            </button>
          )}
          {isAdmin && !editing && canEdit && (
            <button
              onClick={startEdit}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              ✏ Edit
            </button>
          )}
          {isAdmin && !editing && po.status === "pending" && (
            <>
              <button onClick={() => decide("approve")} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                Approve
              </button>
              <button onClick={() => decide("reject")} disabled={busy} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                Reject
              </button>
            </>
          )}
          {isAdmin && !editing && (
            <button onClick={remove} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50">
              Delete
            </button>
          )}
          {editing && (
            <>
              <button onClick={() => setEditing(false)} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
                {busy ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="no-print mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* "On the way" banner + Stock In (confirmed, not editing) */}
      {!editing && po.status === "confirmed" && (
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            🚚 Products coming — on the way
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              {!po.warehouseId && (
                <select
                  value={pickWarehouse}
                  onChange={(e) => setPickWarehouse(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                >
                  <option value="">Choose warehouse…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              )}
              {po.warehouseId && (
                <span className="text-xs text-emerald-700">
                  → {warehouseName(po.warehouseId) ?? "warehouse"}
                </span>
              )}
              <button
                onClick={stockIn}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "Stocking in…" : "📥 Stock In"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Received note */}
      {!editing && po.status === "received" && (
        <div className="no-print mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
          ✓ Stocked into{" "}
          <strong>{warehouseName(po.warehouseId) ?? "inventory"}</strong>
          {po.receivedAt ? ` on ${po.receivedAt.slice(0, 10)}` : ""}
          {po.receivedByName ? ` by ${po.receivedByName}` : ""}.
        </div>
      )}

      {/* Document / edit form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Purchase Order</h1>
            <p className="mt-0.5 font-mono text-lg text-slate-700">{po.poNumber}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS_BADGE[po.status]}`}>
            {STATUS_LABEL[po.status]}
          </span>
        </div>

        {editing ? (
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className={labelClass}>Date</label>
              <input type="date" className={inputClass} value={dDate} onChange={(e) => setDDate(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Vendor</label>
              <input list="po-edit-vendors" className={inputClass} value={dVendor} onChange={(e) => setDVendor(e.target.value)} autoComplete="off" />
              <datalist id="po-edit-vendors">
                {vendors.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelClass}>Invoice No.</label>
              <input className={inputClass} value={dInvoice} onChange={(e) => setDInvoice(e.target.value)} placeholder="optional" autoComplete="off" />
            </div>
            <div>
              <label className={labelClass}>Deliver to warehouse</label>
              <select className={inputClass} value={dWarehouse} onChange={(e) => setDWarehouse(e.target.value)}>
                <option value="">— optional —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
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
              <div className="text-xs uppercase tracking-wide text-slate-400">Warehouse</div>
              <div className="font-medium text-slate-900">
                {warehouseName(po.warehouseId) ?? "—"}
              </div>
            </div>
          </div>
        )}

        {editing ? (
          <div className="space-y-3">
            {dLines.map((l, i) => {
              const c = calc(l);
              return (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Line {i + 1}</span>
                    <button type="button" onClick={() => removeLine(i)} disabled={dLines.length === 1} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 transition hover:bg-white disabled:opacity-40">
                      ✕ Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div>
                      <label className={labelClass}>Product UPC *</label>
                      <input className={inputClass} inputMode="numeric" value={l.ean} onChange={(e) => editEan(i, e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Description *</label>
                      <input className={inputClass} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>HSN Code</label>
                      <input className={inputClass} value={l.hsnCode} onChange={(e) => setLine(i, { hsnCode: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>Carton Size</label>
                      <input type="number" min={0} className={inputClass} value={l.cartonSize} onChange={(e) => setLine(i, { cartonSize: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>Carton Qty</label>
                      <input type="number" min={0} className={inputClass} value={l.cartonQty} onChange={(e) => setLine(i, { cartonQty: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>Total Qty</label>
                      <input className={`${inputClass} bg-slate-100`} value={c.totalQty.toLocaleString("en-IN")} readOnly tabIndex={-1} />
                    </div>
                    <div>
                      <label className={labelClass}>Rate (₹/pc)</label>
                      <input type="number" min={0} step="0.01" className={inputClass} value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>Tax %</label>
                      <input type="number" min={0} step="0.01" className={inputClass} value={l.taxRate} onChange={(e) => setLine(i, { taxRate: e.target.value })} />
                    </div>
                  </div>
                  <div className="mt-2 text-right text-sm text-slate-600">
                    Line total: <strong className="tabular-nums text-slate-900">{inr(c.totalAmount)}</strong>
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={addLine} className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-slate-50">
              + Add line
            </button>
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-right text-lg">
              Grand Total: <strong className="tabular-nums text-slate-900">{inr(draftGrand)}</strong>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className={th}>HSN Code</th>
                  <th className={th}>Product UPC</th>
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
                  <td className={`${td} text-right`} colSpan={10}>Grand Total</td>
                  <td className={`${td} text-right tabular-nums`}>{inr(po.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!editing && po.status === "pending" && (
          <p className="mt-4 text-sm text-amber-700">
            ⏳ Awaiting admin approval. The order is confirmed only after an admin
            approves it.
          </p>
        )}
      </div>
    </div>
  );
}
