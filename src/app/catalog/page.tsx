"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ImageEditor from "@/components/ImageEditor";
import BarcodeEditor from "@/components/BarcodeEditor";
import type { ProductCatalogEntry } from "@/lib/types";

export default function CatalogPage() {
  const [products, setProducts] = useState<ProductCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingEan, setEditingEan] = useState<string | null>(null);
  const [barcodesEan, setBarcodesEan] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [sortTotal, setSortTotal] = useState<"none" | "asc" | "desc">("none");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to load catalog.");
      setProducts(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const editing = products.find((p) => p.ean === editingEan) ?? null;
  const editingBarcodes = products.find((p) => p.ean === barcodesEan) ?? null;

  const warehouseNames = products[0]?.byWarehouse.map((b) => b.warehouseName) ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? products.filter(
          (p) => p.name.toLowerCase().includes(q) || p.ean.includes(q)
        )
      : products;
    if (sortTotal === "asc") {
      list = [...list].sort((a, b) => a.totalQuantity - b.totalQuantity);
    } else if (sortTotal === "desc") {
      list = [...list].sort((a, b) => b.totalQuantity - a.totalQuantity);
    }
    return list;
  }, [products, query, sortTotal]);

  function cycleSortTotal() {
    setSortTotal((s) => (s === "none" ? "desc" : s === "desc" ? "asc" : "none"));
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.ean));

  function toggle(ean: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(ean)) next.delete(ean);
      else next.add(ean);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) => {
      const next = new Set(s);
      if (allFilteredSelected) filtered.forEach((p) => next.delete(p.ean));
      else filtered.forEach((p) => next.add(p.ean));
      return next;
    });
  }

  async function deleteSelected() {
    const eans = [...selected];
    if (eans.length === 0) return;
    if (
      !confirm(
        `Delete ${eans.length} product(s)? This removes them from the catalog along with their stock. This can't be undone.`
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eans }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Delete failed.");
      }
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
        ← Dashboard
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Product Catalog
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every product with stock totalled across all warehouses.
          </p>
        </div>
        <a
          href="/api/products?format=csv"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ⬇ Export CSV
        </a>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by product name or EAN…"
        className="mb-5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-sm font-medium text-red-700">
            {selected.size} product{selected.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : `🗑 Delete ${selected.size} selected`}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {products.length === 0
            ? "No products yet. Receive stock into a warehouse to get started."
            : "No products match your search."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="h-4 w-4 cursor-pointer accent-brand-600 align-middle"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Image</th>
                <th className="px-4 py-3 font-medium">Product</th>
                {warehouseNames.map((n) => (
                  <th key={n} className="px-4 py-3 text-right font-medium">
                    {n}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">
                  <button
                    onClick={cycleSortTotal}
                    title="Sort by total quantity"
                    className="ml-auto inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-slate-700"
                  >
                    Total
                    <span className={sortTotal === "none" ? "text-slate-300" : "text-brand-600"}>
                      {sortTotal === "asc" ? "▲" : sortTotal === "desc" ? "▼" : "⇅"}
                    </span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.ean}
                  className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                    selected.has(p.ean) ? "bg-brand-50/50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.ean)}
                      onChange={() => toggle(p.ean)}
                      aria-label={`Select ${p.name}`}
                      className="h-4 w-4 cursor-pointer accent-brand-600 align-middle"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditingEan(p.ean)}
                      title="Add or change image"
                      className="group relative block h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                    >
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-lg text-slate-300">
                          📷
                        </span>
                      )}
                      <span className="absolute inset-0 hidden items-center justify-center bg-slate-900/50 text-xs font-medium text-white group-hover:flex">
                        Edit
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{p.name}</span>
                      {p.lowStock && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          Low
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      EAN {p.ean}
                      {p.barcodes.length > 0 && (
                        <span className="ml-2">
                          · {p.barcodes.length} pack barcode
                          {p.barcodes.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setBarcodesEan(p.ean)}
                      className="mt-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      🏷 Barcodes
                    </button>
                  </td>
                  {p.byWarehouse.map((b) => (
                    <td
                      key={b.warehouseId}
                      className="px-4 py-3 text-right tabular-nums text-slate-600"
                    >
                      {b.quantity.toLocaleString()}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                    {p.totalQuantity.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Showing <strong className="text-slate-900">{filtered.length}</strong> of{" "}
          {products.length} products.
        </p>
      )}

      {editing && (
        <ImageEditor
          ean={editing.ean}
          name={editing.name}
          imageUrl={editing.imageUrl}
          onClose={() => setEditingEan(null)}
          onSaved={load}
        />
      )}

      {editingBarcodes && (
        <BarcodeEditor
          ean={editingBarcodes.ean}
          name={editingBarcodes.name}
          barcodes={editingBarcodes.barcodes}
          onClose={() => setBarcodesEan(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
