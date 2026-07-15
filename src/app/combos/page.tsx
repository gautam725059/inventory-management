"use client";

import { useEffect, useMemo, useState } from "react";
import { useChannel, codeWord } from "@/lib/useChannel";
import type { ComboView, ProductCatalogEntry } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

interface DraftComponent {
  ean: string;
  quantity: string;
}
interface Draft {
  id: string | null; // null = creating
  name: string;
  barcode: string;
  price: string;
  components: DraftComponent[];
}

const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  barcode: "",
  price: "",
  components: [{ ean: "", quantity: "1" }],
};

export default function CombosPage() {
  const channel = useChannel();
  const [combos, setCombos] = useState<ComboView[]>([]);
  const [products, setProducts] = useState<ProductCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const productName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) m.set(p.ean, p.name);
    return m;
  }, [products]);

  async function load() {
    try {
      const [c, p] = await Promise.all([
        fetch("/api/combos").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/products").then((r) => (r.ok ? r.json() : [])),
      ]);
      setCombos(Array.isArray(c) ? c : []);
      setProducts(Array.isArray(p) ? p : []);
    } catch {
      setError("Failed to load combos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setError(null);
    setDraft({ ...EMPTY_DRAFT, components: [{ ean: "", quantity: "1" }] });
  }

  function startEdit(c: ComboView) {
    setError(null);
    setDraft({
      id: c.id,
      name: c.name,
      barcode: c.barcode ?? "",
      price: c.price != null ? String(c.price) : "",
      components: c.components.map((k) => ({ ean: k.ean, quantity: String(k.quantity) })),
    });
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }
  function setComponent(i: number, patch: Partial<DraftComponent>) {
    setDraft((d) => {
      if (!d) return d;
      const components = d.components.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
      return { ...d, components };
    });
  }
  function addComponentRow() {
    setDraft((d) => (d ? { ...d, components: [...d.components, { ean: "", quantity: "1" }] } : d));
  }
  function removeComponentRow(i: number) {
    setDraft((d) =>
      d ? { ...d, components: d.components.filter((_, idx) => idx !== i) } : d
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const components = draft.components
        .map((c) => ({ ean: c.ean.trim(), quantity: Number(c.quantity) }))
        .filter((c) => c.ean && Number.isInteger(c.quantity) && c.quantity > 0);
      if (!draft.name.trim()) throw new Error("Combo name is required.");
      if (!components.length) throw new Error("Add at least one product to the combo.");

      const body = {
        name: draft.name.trim(),
        barcode: draft.barcode.trim(),
        price: draft.price.trim() === "" ? undefined : Number(draft.price),
        components,
      };
      const url = draft.id ? `/api/combos/${draft.id}` : "/api/combos";
      const method = draft.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save combo.");
      }
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save combo.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: ComboView) {
    if (!confirm(`Delete combo "${c.name}"? This can't be undone.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/combos/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete combo.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete combo.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Combos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Bundle different products together. Selling a combo deducts each
            item&rsquo;s stock automatically.
          </p>
        </div>
        {!draft && (
          <button
            onClick={startCreate}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            + New Combo
          </button>
        )}
      </header>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {draft && (
        <div className="mb-8 rounded-xl border border-brand-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            {draft.id ? "Edit combo" : "New combo"}
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className={labelClass}>Combo name *</label>
              <input
                className={inputClass}
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="e.g. Hook Combo Set"
              />
            </div>
            <div>
              <label className={labelClass}>Combo barcode (optional)</label>
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.barcode}
                onChange={(e) => updateDraft({ barcode: e.target.value })}
                placeholder={`Scan / type a ${codeWord(channel)}`}
              />
            </div>
            <div>
              <label className={labelClass}>Combo price (optional)</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                onChange={(e) => updateDraft({ price: e.target.value })}
                placeholder="e.g. 299"
              />
            </div>
          </div>

          <div className="mt-5">
            <label className={labelClass}>Products in this combo *</label>
            <div className="space-y-2">
              {draft.components.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className={`${inputClass} flex-1`}
                    value={c.ean}
                    onChange={(e) => setComponent(i, { ean: e.target.value })}
                  >
                    <option value="">Select a product…</option>
                    {products.map((p) => (
                      <option key={p.ean} value={p.ean}>
                        {p.name} ({p.ean})
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${inputClass} w-24`}
                    type="number"
                    min={1}
                    step={1}
                    value={c.quantity}
                    onChange={(e) => setComponent(i, { quantity: e.target.value })}
                    placeholder="Qty"
                    aria-label="Quantity per combo"
                  />
                  <button
                    onClick={() => removeComponentRow(i)}
                    disabled={draft.components.length === 1}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                    aria-label="Remove product"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addComponentRow}
              className="mt-2 text-sm font-medium text-brand-600 hover:underline"
            >
              + Add another product
            </button>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : draft.id ? "Save changes" : "Create combo"}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : combos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No combos yet. Click <strong>+ New Combo</strong> to create your first
          bundle.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {combos.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-slate-900">
                      🎁 {c.name}
                    </span>
                    {c.price != null && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        ₹{c.price.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {c.barcode && (
                    <div className="mt-0.5 text-xs text-slate-400">
                      Barcode {c.barcode}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(c)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(c)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {c.lines.map((l) => (
                  <li
                    key={l.ean}
                    className="rounded-lg bg-slate-50 px-2.5 py-1 text-sm text-slate-700 ring-1 ring-slate-200"
                  >
                    {productName.get(l.ean) ?? l.name}{" "}
                    <span className="font-semibold text-brand-700">×{l.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
