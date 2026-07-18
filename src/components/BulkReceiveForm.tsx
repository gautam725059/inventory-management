"use client";

import { useEffect, useMemo, useState } from "react";
import { useChannel, codeWord, isValidCode } from "@/lib/useChannel";
import type { Vendor, ProductCatalogEntry } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

const MAX_LINES = 20;

interface Props {
  warehouseId: string;
  onReceived: () => void | Promise<void>;
  onError: (message: string) => void;
}

interface Row {
  ean: string;
  quantity: string;
  purchasePrice: string;
  name: string; // used only when the code is a NEW product
}

function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const EMPTY_ROW: Row = { ean: "", quantity: "", purchasePrice: "", name: "" };

/** The one stock-in form: receive several products on one bill. If a code isn't
 *  in the catalog yet, type a name on that line and it's created on receive. */
export default function BulkReceiveForm({ warehouseId, onReceived, onError }: Props) {
  const channel = useChannel();
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [date, setDate] = useState(today());
  const [bill, setBill] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<ProductCatalogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  // Per-row "search by name" text (Blinkit-style product picker).
  const [search, setSearch] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch("/api/vendors").then((r) => (r.ok ? r.json() : [])).then((d) => setVendors(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Resolve a scanned code (primary or pack barcode) to a catalog product.
  const productByCode = useMemo(() => {
    const m = new Map<string, ProductCatalogEntry>();
    for (const p of products) {
      m.set(p.ean, p);
      for (const b of p.barcodes ?? []) m.set(b.ean, p);
    }
    return m;
  }, [products]);

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  /** Products matching a row's name search (min 2 chars), best few first. */
  function nameMatches(i: number): ProductCatalogEntry[] {
    const q = (search[i] ?? "").trim().toLowerCase();
    if (q.length < 2) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.ean.includes(q))
      .slice(0, 8);
  }

  /** Pick a product from the name search — fills its code into the line. */
  function pickProduct(i: number, p: ProductCatalogEntry) {
    setRow(i, { ean: p.ean, name: "" });
    setSearch((s) => ({ ...s, [i]: "" }));
  }
  function addRow() {
    setRows((rs) => (rs.length >= MAX_LINES ? rs : [...rs, { ...EMPTY_ROW }]));
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  /** Per-row resolution: existing product, or a valid new product (code + name). */
  const info = rows.map((r) => {
    const code = r.ean.trim();
    const product = code ? productByCode.get(code) : undefined;
    const isNew = !!code && !product;
    const qty = Number(r.quantity) || 0;
    const valid =
      qty > 0 &&
      (product
        ? true
        : isNew && isValidCode(code, channel) && r.name.trim().length > 0);
    return { r, code, product, isNew, qty, valid };
  });
  const validRows = info.filter((x) => x.valid);
  const totalPieces = validRows.reduce((s, x) => s + x.qty, 0);
  const newCount = validRows.filter((x) => !x.product).length;

  const canSubmit =
    validRows.length > 0 &&
    bill.trim().length > 0 &&
    vendorName.trim().length > 0 &&
    date.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    onError("");
    try {
      const res = await fetch(`/api/warehouses/${warehouseId}/receive-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bill: bill.trim(),
          vendorName: vendorName.trim(),
          date: date.trim(),
          lines: validRows.map((x) => ({
            ean: x.code,
            quantity: x.qty,
            purchasePrice: x.r.purchasePrice ? Number(x.r.purchasePrice) : undefined,
            name: x.product ? undefined : x.r.name.trim(),
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to receive goods.");
      }
      setRows([{ ...EMPTY_ROW }]);
      setBill("");
      await onReceived();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to receive goods.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-base font-semibold text-slate-900">Receive products</h3>
      <p className="mb-4 text-sm text-slate-500">
        Add one or more products on one bill. <strong>Search by name</strong> to
        pick a product (its image and {codeWord(channel)} fill in), or scan the{" "}
        {codeWord(channel)} directly. A code that isn&rsquo;t in the catalog yet
        creates a new product — just type its name on that line.
      </p>

      {/* Shared bill details */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Date *</label>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>Bill no. *</label>
          <input className={inputClass} value={bill} onChange={(e) => setBill(e.target.value)} placeholder="e.g. BILL-2026-001" autoComplete="off" required />
        </div>
        <div>
          <label className={labelClass}>Vendor *</label>
          <input list="bulk-recv-vendors" className={inputClass} value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Pick or type a vendor…" autoComplete="off" required />
          <datalist id="bulk-recv-vendors">
            {vendors.map((v) => (
              <option key={v.id} value={v.name} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Product lines */}
      <div className="space-y-2">
        {rows.map((row, i) => {
          const x = info[i];
          return (
            <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              {/* Search by name — picks the product and fills its code */}
              <div className="relative mb-2">
                <label className={labelClass}>🔍 Search product by name</label>
                <input
                  className={inputClass}
                  value={search[i] ?? ""}
                  onChange={(e) => setSearch((s) => ({ ...s, [i]: e.target.value }))}
                  placeholder="Type a product name… (e.g. wall hooks)"
                  autoComplete="off"
                />
                {nameMatches(i).length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {nameMatches(i).map((p) => (
                      <li key={p.ean}>
                        <button
                          type="button"
                          onClick={() => pickProduct(i, p)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-brand-50"
                        >
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="h-10 w-10 shrink-0 rounded-md border border-slate-200 object-cover"
                            />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-300">
                              📷
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-slate-900">{p.name}</span>
                            <span className="block font-mono text-xs text-slate-400">
                              {codeWord(channel)} {p.ean}
                              <span className="ml-2 font-sans text-slate-400">
                                · {p.totalQuantity.toLocaleString()} in stock
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-5">
                  <label className={labelClass}>Scan / enter {codeWord(channel)}</label>
                  <input
                    className={inputClass}
                    inputMode={channel === "b2b" ? "text" : "numeric"}
                    autoComplete="off"
                    value={row.ean}
                    onChange={(e) => setRow(i, { ean: e.target.value })}
                    placeholder={`Type the ${codeWord(channel)}…`}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelClass}>Quantity (pcs)</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={inputClass}
                    value={row.quantity}
                    onChange={(e) => setRow(i, { quantity: e.target.value })}
                    placeholder="0"
                    disabled={!x.code}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelClass}>Purchase ₹/pc</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={inputClass}
                    value={row.purchasePrice}
                    onChange={(e) => setRow(i, { purchasePrice: e.target.value })}
                    placeholder="optional"
                    disabled={!x.code}
                  />
                </div>
                <div className="flex justify-end sm:col-span-1">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 transition hover:bg-white disabled:opacity-40"
                    aria-label="Remove line"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {x.product && (
                <div className="mt-2 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2">
                  {x.product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={x.product.imageUrl}
                      alt={x.product.name}
                      className="h-11 w-11 shrink-0 rounded-md border border-emerald-200 bg-white object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-white text-slate-300">
                      📷
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-emerald-800">
                      ✓ {x.product.name}
                    </div>
                    <div className="font-mono text-xs text-emerald-700">
                      {codeWord(channel)} {x.product.ean}
                      <span className="ml-2 font-sans text-emerald-600">
                        · {x.product.totalQuantity.toLocaleString()} in stock
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {x.isNew && (
                <div className="mt-2">
                  <label className={labelClass}>
                    🆕 New product — name *
                  </label>
                  <input
                    className={inputClass}
                    value={row.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    placeholder="Product name (this creates a new product)"
                    autoComplete="off"
                  />
                  {!isValidCode(x.code, channel) && (
                    <p className="mt-1 text-xs text-red-600">
                      Invalid {codeWord(channel)}.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= MAX_LINES}
        className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-brand-600 transition hover:bg-slate-50 disabled:opacity-40"
      >
        + Add product {rows.length >= MAX_LINES ? `(max ${MAX_LINES})` : ""}
      </button>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="text-sm text-slate-600">
          {validRows.length} product{validRows.length === 1 ? "" : "s"} ·{" "}
          <strong className="text-slate-900">{totalPieces.toLocaleString()}</strong> pieces
          {newCount > 0 && (
            <span className="ml-2 text-fuchsia-600">· {newCount} new</span>
          )}
        </div>
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Receiving…" : `Receive ${validRows.length || ""} into warehouse`}
        </button>
      </div>
    </form>
  );
}
