"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";
import { useChannel, codeLabel, codeWord, isValidCode } from "@/lib/useChannel";
import type { WarehouseDetail, Vendor } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const REASONS = [
  "Damage",
  "Count correction",
  "Theft / Loss",
  "Found / Recount",
  "add new stock",
  "Other",
];

export default function AdjustPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { me, loading: meLoading } = useMe();
  const channel = useChannel();
  const allowed = !!me; // any logged-in user can submit
  const isAdmin = me?.role === "admin";

  const [detail, setDetail] = useState<WarehouseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [mode, setMode] = useState<"adjust" | "new">("adjust");
  const [ean, setEan] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // New-product form.
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [np, setNp] = useState({
    ean: "",
    name: "",
    quantity: "",
    vendorName: "",
    bill: "",
    date: today(),
    purchasePrice: "",
  });

  function pickImage(file: File | null) {
    setImageFile(file);
    setPreview(file ? URL.createObjectURL(file) : "");
  }

  async function load() {
    try {
      const res = await fetch(`/api/warehouses/${id}`);
      if (!res.ok) throw new Error("Failed to load warehouse.");
      setDetail(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    if (allowed) {
      load();
      fetch("/api/vendors")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setVendors(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, allowed]);

  // Resolve the typed code to a stock line — by primary EAN/12NC or any pack
  // barcode (e.g. an ASIN).
  const selected = useMemo(() => {
    const e = ean.trim();
    if (!e) return undefined;
    return detail?.lines.find(
      (l) => l.ean === e || (l.barcodes ?? []).some((b) => b.ean === e)
    );
  }, [detail, ean]);
  const noMatch = ean.trim().length > 0 && !selected;

  const amt = Number(amount) || 0;
  const delta = direction === "remove" ? -amt : amt;
  const current = selected?.quantity ?? 0;
  const resulting = current + delta;
  const invalid = amt <= 0 || resulting < 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/warehouses/${id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ean: selected?.ean ?? ean.trim(),
          delta,
          reason,
          note: note || undefined,
          productName: selected?.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to adjust stock.");
      }
      if (data.pending) {
        setSuccess(
          "Adjustment submitted for admin approval. Stock will update once an admin approves it."
        );
      } else {
        setSuccess(
          `Stock adjusted (${delta > 0 ? "+" : ""}${delta}). Reason: ${reason}.`
        );
      }
      setEan("");
      setAmount("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock.");
    } finally {
      setSaving(false);
    }
  }

  const npValid =
    isValidCode(np.ean, channel) &&
    np.name.trim().length > 0 &&
    Number(np.quantity) > 0 &&
    np.vendorName.trim().length > 0 &&
    np.bill.trim().length > 0 &&
    np.date.trim().length > 0;

  async function submitNewProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/warehouses/${id}/add-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ean: np.ean.trim(),
          name: np.name.trim(),
          quantity: Number(np.quantity),
          vendorName: np.vendorName.trim(),
          bill: np.bill.trim(),
          date: np.date.trim(),
          purchasePrice: np.purchasePrice || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add product.");

      // Admin add is applied immediately → upload the image now. Staff go through
      // approval (product not created yet), so the image is added later.
      if (data.applied && imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        await fetch(`/api/products/${encodeURIComponent(np.ean.trim())}/image`, {
          method: "POST",
          body: fd,
        }).catch(() => {});
      }

      setSuccess(
        data.pending
          ? "New product submitted for admin approval." +
              (imageFile ? " Add the image from the Catalog once it's approved." : "")
          : `New product "${np.name.trim()}" added with ${np.quantity} pieces.`
      );
      setNp({ ean: "", name: "", quantity: "", vendorName: np.vendorName, bill: np.bill, date: np.date, purchasePrice: "" });
      pickImage(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add product.");
    } finally {
      setSaving(false);
    }
  }

  if (meLoading) {
    return <div className="py-20 text-center text-sm text-slate-400">Loading…</div>;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <Link href={`/warehouse/${id}`} className="text-sm font-medium text-brand-600 hover:underline">
          ← Warehouse
        </Link>
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Stock adjustment is restricted to admins.
        </div>
      </div>
    );
  }

  const inStock = detail?.lines ?? [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href={`/warehouse/${id}`} className="text-sm font-medium text-brand-600 hover:underline">
        ← {detail?.name ?? "Warehouse"}
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Adjust Stock &amp; Add Products
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Correct stock (+/−) with a reason, or add a brand-new product with its
          opening stock.
        </p>
        {!isAdmin && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            🔒 Your stock adjustments <strong>and new products</strong> need{" "}
            <strong>admin approval</strong> before they take effect. They&rsquo;ll
            appear in the admin panel as pending requests.
          </div>
        )}
      </header>

      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => { setMode("adjust"); setError(null); setSuccess(null); }}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
            mode === "adjust" ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          ⚖️ Adjust Stock
        </button>
        <button
          onClick={() => { setMode("new"); setError(null); setSuccess(null); }}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
            mode === "new" ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          🆕 Add New Product
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {mode === "adjust" ? (
        inStock.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No stock in this warehouse to adjust.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ean" className={labelClass}>
                {codeLabel(channel)} *
              </label>
              <input
                id="ean"
                className={inputClass}
                value={ean}
                onChange={(e) => setEan(e.target.value)}
                placeholder={`Scan or type the ${codeWord(channel)}…`}
                inputMode={channel === "b2b" ? "text" : "numeric"}
                autoComplete="off"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                required
              />
              {noMatch && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  No product with this code in this warehouse.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="product-name" className={labelClass}>
                Product name
              </label>
              <input
                id="product-name"
                className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-700`}
                value={selected?.name ?? ""}
                readOnly
                tabIndex={-1}
                placeholder="Auto-fills from the code"
              />
              {selected && (
                <p className="mt-1 text-xs text-emerald-600">
                  ✓ {selected.quantity} pcs in stock
                </p>
              )}
            </div>

            <div>
              <label htmlFor="direction" className={labelClass}>Direction *</label>
              <select
                id="direction"
                className={inputClass}
                value={direction}
                onChange={(e) => setDirection(e.target.value as "add" | "remove")}
                disabled={!selected}
              >
                <option value="remove">Remove (−)</option>
                <option value="add">Add (+)</option>
              </select>
            </div>

            <div>
              <label htmlFor="amount" className={labelClass}>Amount (pieces) *</label>
              <input
                id="amount"
                type="number"
                min={1}
                step={1}
                className={inputClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1"
                disabled={!selected}
                required
              />
            </div>

            <div>
              <label htmlFor="reason" className={labelClass}>Reason *</label>
              <select
                id="reason"
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!selected}
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="note" className={labelClass}>Note (optional)</label>
              <input
                id="note"
                className={inputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reference / detail"
                disabled={!selected}
              />
            </div>
          </div>

          {selected && amt > 0 && (
            <p
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                resulting < 0
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {current} {delta >= 0 ? "+" : "−"} {Math.abs(delta)} ={" "}
              <strong className={resulting < 0 ? "text-red-700" : "text-brand-700"}>
                {resulting}
              </strong>{" "}
              pieces.
              {resulting < 0 && " Can't go below zero."}
            </p>
          )}

          <div className="mt-5">
            <button
              type="submit"
              disabled={saving || !selected || invalid}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Submitting…"
                : isAdmin
                  ? "Apply adjustment"
                  : "Submit for approval"}
            </button>
          </div>
        </form>
        )
      ) : (
        <form onSubmit={submitNewProduct} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-slate-900">Add a new product</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{codeLabel(channel)} *</label>
              <input
                className={inputClass}
                value={np.ean}
                onChange={(e) => setNp({ ...np, ean: e.target.value })}
                placeholder={`Scan or type a new ${codeWord(channel)}`}
                inputMode={channel === "b2b" ? "text" : "numeric"}
                autoComplete="off"
                required
              />
              {np.ean.trim() && !isValidCode(np.ean, channel) && (
                <p className="mt-1 text-xs text-red-600">Invalid {codeWord(channel)}.</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Product name *</label>
              <input
                className={inputClass}
                value={np.name}
                onChange={(e) => setNp({ ...np, name: e.target.value })}
                placeholder="e.g. Shanya Crystal Hook"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Quantity (pieces) *</label>
              <input
                type="number"
                min={1}
                step={1}
                className={inputClass}
                value={np.quantity}
                onChange={(e) => setNp({ ...np, quantity: e.target.value })}
                placeholder="100"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Vendor name *</label>
              <input
                list="adj-np-vendors"
                className={inputClass}
                value={np.vendorName}
                onChange={(e) => setNp({ ...np, vendorName: e.target.value })}
                placeholder="Pick or type a vendor…"
                autoComplete="off"
                required
              />
              <datalist id="adj-np-vendors">
                {vendors.map((v) => (
                  <option key={v.id} value={v.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelClass}>Bill no. *</label>
              <input
                className={inputClass}
                value={np.bill}
                onChange={(e) => setNp({ ...np, bill: e.target.value })}
                placeholder="e.g. BILL-2026-001"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Date *</label>
              <input
                type="date"
                className={inputClass}
                value={np.date}
                onChange={(e) => setNp({ ...np, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Purchase price (per piece)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                value={np.purchasePrice}
                onChange={(e) => setNp({ ...np, purchasePrice: e.target.value })}
                placeholder="Cost price, optional"
              />
            </div>
          </div>

          {/* Product image */}
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label className={labelClass}>Product image (optional)</label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-3xl text-slate-300">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="preview" className="h-full w-full object-cover" />
                ) : (
                  "🖼️"
                )}
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
                className="block flex-1 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
              />
            </div>
            {!isAdmin && preview && (
              <p className="mt-2 text-xs text-amber-600">
                Note: the image is added after an admin approves this product.
              </p>
            )}
          </div>

          <div className="mt-5">
            <button
              type="submit"
              disabled={saving || !npValid}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Submitting…"
                : isAdmin
                  ? "Add product"
                  : "Submit for approval"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
