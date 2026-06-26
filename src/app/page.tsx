"use client";

import { useEffect, useState } from "react";
import WarehouseCard from "@/components/WarehouseCard";
import { useChannel } from "@/lib/useChannel";
import type { WarehouseSummary, ProductCatalogEntry } from "@/lib/types";

/** Brands shown on the B2B dashboard. A product belongs to a brand when its name
 *  contains the brand word (case-insensitive). */
const BRANDS = ["Philips", "Wipro", "Hindware", "Gorav", "Orient"];

export default function Dashboard() {
  const channel = useChannel();
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const [products, setProducts] = useState<ProductCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [whRes, prRes] = await Promise.all([
          fetch("/api/warehouses"),
          fetch("/api/products"),
        ]);
        if (!whRes.ok) throw new Error("Failed to load warehouses.");
        setWarehouses(await whRes.json());
        if (prRes.ok) setProducts(await prRes.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalUnits = warehouses.reduce((s, w) => s + w.totalUnits, 0);
  const totalLines = warehouses.reduce((s, w) => s + w.skuCount, 0);
  // Low / out of stock across the whole catalog (total stock at or below the
  // reorder level — includes products that are completely out of stock).
  const totalLow = products.filter((p) => p.lowStock).length;
  // Total inventory value (this channel) = Σ stock × selling price.
  const totalValue = products.reduce(
    (s, p) => s + p.totalQuantity * (p.sellingPrice ?? 0),
    0
  );

  // Per-brand product count + total pieces. Matches the product's `brand` field
  // first, then falls back to the brand word appearing in its name.
  const brandStats = BRANDS.map((brand) => {
    const b = brand.toLowerCase();
    const matched = products.filter(
      (p) =>
        (p.brand && p.brand.toLowerCase() === b) ||
        p.name.toLowerCase().includes(b)
    );
    return {
      brand,
      productCount: matched.length,
      quantity: matched.reduce((s, p) => s + p.totalQuantity, 0),
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Warehouse Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Select a warehouse to receive stock and manage combos. Use the channel
          switch in the sidebar to move between E-commerce and B2B.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          <div className="relative mb-8 flex flex-col gap-5 overflow-hidden rounded-2xl bg-linear-to-br from-brand-600 via-brand-700 to-brand-800 p-6 text-white shadow-lg shadow-brand-200 sm:flex-row sm:items-center sm:justify-between">
            {/* decorative glows */}
            <span className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <span className="pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-brand-400/20 blur-3xl" />

            <div className="relative flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-3xl shadow-inner ring-1 ring-white/25">
                📦
              </span>
              <div>
                <p className="text-sm font-medium text-brand-100">
                  Total stock — all warehouses
                </p>
                <p className="mt-1 text-4xl font-bold tabular-nums">
                  {totalUnits.toLocaleString()}{" "}
                  <span className="text-xl font-medium text-brand-100">pieces</span>
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-brand-100">
                  ₹{totalValue.toLocaleString("en-IN")}{" "}
                  <span className="text-sm font-medium">inventory value</span>
                </p>
              </div>
            </div>
            <div className="relative flex gap-3 sm:gap-4">
              {[
                { v: warehouses.length, l: "Warehouses" },
                { v: totalLines, l: "Stock lines" },
                { v: totalLow, l: "Low / Out" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="min-w-20 rounded-xl bg-white/10 px-4 py-3 text-center ring-1 ring-white/15 backdrop-blur-sm"
                >
                  <p className="text-2xl font-bold tabular-nums sm:text-3xl">{s.v}</p>
                  <p className="text-xs uppercase tracking-wide text-brand-100">{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {warehouses.map((w) => (
              <WarehouseCard key={w.id} warehouse={w} />
            ))}
          </div>

          {channel === "b2b" && (
            <section className="mt-10">
              <h2 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
                Brands
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {brandStats.map((b) => (
                  <div
                    key={b.brand}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-base">
                        🏷️
                      </span>
                      <h3 className="font-semibold text-slate-900">{b.brand}</h3>
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <div className="text-xl font-bold tabular-nums text-slate-900">
                          {b.productCount}
                        </div>
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          Products
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold tabular-nums text-indigo-700">
                          {b.quantity.toLocaleString()}
                        </div>
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          Pieces
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
