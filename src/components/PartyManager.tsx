"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMe, canApprove } from "@/lib/useMe";
import type { Vendor, VendorDetail, CustomerDetail, PartyTxn } from "@/lib/types";

type Detail = (VendorDetail | CustomerDetail) & { totalValue?: number };

interface Props {
  kind: "vendor" | "customer";
  apiBase: string; // e.g. "/api/vendors"
  title: string;
  subtitle: string;
  refLabel: string; // "Bill" | "Invoice"
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const BLANK = { name: "", phone: "", gstin: "", address: "", note: "" };

export default function PartyManager({ kind, apiBase, title, subtitle, refLabel }: Props) {
  const { me } = useMe();
  const canManage = canApprove(me);

  const [list, setList] = useState<Vendor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [form, setForm] = useState(BLANK);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(BLANK);

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiBase);
      if (!res.ok) throw new Error("Failed to load.");
      setList(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = useCallback(
    async (id: string) => {
      setOpenId(id);
      setDetail(null);
      setEditing(false);
      try {
        const res = await fetch(`${apiBase}/${id}`);
        if (!res.ok) throw new Error("Failed to load history.");
        const d: Detail = await res.json();
        setDetail(d);
        setEditForm({
          name: d.name,
          phone: d.phone ?? "",
          gstin: d.gstin ?? "",
          address: d.address ?? "",
          note: d.note ?? "",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history.");
      }
    },
    [apiBase]
  );

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add.");
      }
      setForm(BLANK);
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!openId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/${openId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save.");
      }
      setEditing(false);
      await Promise.all([load(), openDetail(openId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  const filtered = list.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.phone ?? "").includes(q) ||
      (p.gstin ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
        ← Dashboard
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {canManage && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            {adding ? "Close" : `+ Add ${kind}`}
          </button>
        )}
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {canManage && adding && (
        <form
          onSubmit={create}
          className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2"
        >
          <div>
            <label className={labelClass}>Name *</label>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              className={inputClass}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>GSTIN</label>
            <input
              className={inputClass}
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Address</label>
            <input
              className={inputClass}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Note</label>
            <input
              className={inputClass}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, phone, or GSTIN…"
        className="mb-5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {list.length === 0
            ? `No ${kind}s yet. They're created automatically on stock-${
                kind === "vendor" ? "in" : "out"
              }, or add one above.`
            : "No matches."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">GSTIN</th>
                <th className="px-4 py-3 text-right font-medium">History</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-600">{p.phone || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{p.gstin || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openDetail(p.id)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <PartyDetailModal
          detail={detail}
          kind={kind}
          refLabel={refLabel}
          canManage={canManage}
          editing={editing}
          editForm={editForm}
          setEditForm={setEditForm}
          onEdit={() => setEditing(true)}
          onCancelEdit={() => setEditing(false)}
          onSave={saveEdit}
          busy={busy}
          onClose={() => {
            setOpenId(null);
            setDetail(null);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function PartyDetailModal({
  detail,
  kind,
  refLabel,
  canManage,
  editing,
  editForm,
  setEditForm,
  onEdit,
  onCancelEdit,
  onSave,
  busy,
  onClose,
}: {
  detail: Detail | null;
  kind: "vendor" | "customer";
  refLabel: string;
  canManage: boolean;
  editing: boolean;
  editForm: typeof BLANK;
  setEditForm: (f: typeof BLANK) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!detail ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{detail.name}</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  {[detail.phone, detail.gstin].filter(Boolean).join(" · ") || "No contact details"}
                </p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Summary */}
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
                <div className="text-xs text-slate-500">
                  {kind === "vendor" ? "Purchased" : "Sold"}
                </div>
                <div className="text-lg font-bold tabular-nums text-slate-900">
                  {detail.totalQuantity.toLocaleString("en-IN")} pcs
                </div>
              </div>
              {detail.totalValue !== undefined && (
                <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2">
                  <div className="text-xs text-brand-700">Purchase value</div>
                  <div className="text-lg font-bold tabular-nums text-brand-700">
                    {inr(detail.totalValue)}
                  </div>
                </div>
              )}
            </div>

            {/* Edit fields */}
            {canManage && (
              <div className="mt-4">
                {editing ? (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                    {(["name", "phone", "gstin", "address", "note"] as const).map((k) => (
                      <div key={k} className={k === "address" || k === "note" ? "sm:col-span-2" : ""}>
                        <label className={labelClass}>{k[0].toUpperCase() + k.slice(1)}</label>
                        <input
                          className={inputClass}
                          value={editForm[k]}
                          onChange={(e) => setEditForm({ ...editForm, [k]: e.target.value })}
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 sm:col-span-2">
                      <button
                        onClick={onSave}
                        disabled={busy}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onEdit}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Edit details
                  </button>
                )}
              </div>
            )}

            {/* History */}
            <h4 className="mb-2 mt-6 text-sm font-semibold text-slate-900">
              {kind === "vendor" ? "Purchase history" : "Sales history"}
            </h4>
            {detail.txns.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                No transactions yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium">{refLabel}</th>
                      <th className="px-3 py-2 font-medium">Warehouse</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.txns.map((t: PartyTxn) => (
                      <tr key={t.id} className="border-b border-slate-100 last:border-0">
                        <td className="whitespace-nowrap px-3 py-2 text-slate-500">{t.date}</td>
                        <td className="px-3 py-2">
                          <div className="text-slate-900">{t.productName}</div>
                          <div className="text-xs text-slate-400">EAN {t.ean}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{t.ref || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{t.warehouseName}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {t.quantity.toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {t.amount !== undefined ? inr(t.amount) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
