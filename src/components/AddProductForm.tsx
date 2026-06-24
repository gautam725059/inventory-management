"use client";

import { useEffect, useMemo, useState } from "react";
import { useChannel, codeLabel, codeWord } from "@/lib/useChannel";
import type { Vendor, ProductCatalogEntry } from "@/lib/types";

function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const EMPTY_FORM = {
  ean: "",
  name: "",
  quantity: "",
  vendorName: "",
  bill: "",
  date: today(),
  purchasePrice: "",
  reorderLevel: "",
  imageUrl: "",
};

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

interface Props {
  warehouseId: string;
  onAdded: (name: string) => void | Promise<void>;
  onError: (message: string) => void;
}

/** Create a brand-new product (EAN + name compulsory) and receive its first
 *  stock into a warehouse, with an optional product image. Unlike Stock In,
 *  the EAN is typed/scanned here because the product doesn't exist yet. */
export default function AddProductForm({ warehouseId, onAdded, onError }: Props) {
  const channel = useChannel();
  const [form, setForm] = useState(EMPTY_FORM);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<ProductCatalogEntry[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/vendors")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setVendors(Array.isArray(list) ? list : []))
      .catch(() => setVendors([]));
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setProducts(Array.isArray(list) ? list : []))
      .catch(() => setProducts([]));
  }, []);

  const eanValid = /^\d{6,14}$/.test(form.ean.trim());
  // Warn (but don't block) if the EAN already belongs to a product.
  const existing = useMemo(
    () => products.find((p) => p.ean === form.ean.trim()),
    [products, form.ean]
  );

  const canSubmit =
    eanValid &&
    form.name.trim().length > 0 &&
    Number(form.quantity) > 0 &&
    form.vendorName.trim().length > 0 &&
    form.bill.trim().length > 0 &&
    form.date.trim().length > 0;

  function pickImage(file: File | null) {
    setImageFile(file);
    setPreview(file ? URL.createObjectURL(file) : "");
    if (file) setForm((f) => ({ ...f, imageUrl: "" })); // file wins over URL
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError("");
    if (!eanValid) {
      onError(`${codeWord(channel)} must be 6–14 digits.`);
      return;
    }
    if (!form.name.trim()) {
      onError("Product name is required.");
      return;
    }
    setSaving(true);
    const ean = form.ean.trim();
    try {
      // 1. Create the product + receive its first stock.
      const res = await fetch(`/api/warehouses/${warehouseId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ean,
          quantity: Number(form.quantity),
          name: form.name.trim(),
          vendorName: form.vendorName.trim(),
          bill: form.bill.trim(),
          date: form.date.trim(),
          purchasePrice: form.purchasePrice || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add product.");
      }

      // 2. Apply the extra fields the receive endpoint doesn't take
      //    (reorder level, and an image URL if no file was chosen).
      const updates: Record<string, unknown> = {};
      if (form.reorderLevel) updates.reorderLevel = Number(form.reorderLevel);
      if (!imageFile && form.imageUrl.trim()) updates.imageUrl = form.imageUrl.trim();
      if (Object.keys(updates).length > 0) {
        await fetch(`/api/products/${ean}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        }).catch(() => {});
      }

      // 3. Upload the image file, if one was chosen.
      if (imageFile) {
        const body = new FormData();
        body.append("file", imageFile);
        const imgRes = await fetch(`/api/products/${ean}/image`, {
          method: "POST",
          body,
        });
        if (!imgRes.ok) {
          const data = await imgRes.json().catch(() => ({}));
          // Product is already created; surface the image issue but don't fail.
          onError(
            `Product added, but the image failed: ${data.error || "upload error"}.`
          );
        }
      }

      const addedName = form.name.trim();
      // Reset per-product fields; keep vendor / bill / date for the next add.
      setForm((f) => ({
        ...EMPTY_FORM,
        vendorName: f.vendorName,
        bill: f.bill,
        date: f.date,
      }));
      pickImage(null);
      await onAdded(addedName);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h3 className="mb-4 text-base font-semibold text-slate-900">
        Add a new product
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="np-ean" className={labelClass}>
            {codeLabel(channel)} *
          </label>
          <input
            id="np-ean"
            className={inputClass}
            value={form.ean}
            onChange={(e) => setForm({ ...form, ean: e.target.value })}
            placeholder={`Scan or type a new ${codeWord(channel)}`}
            inputMode="numeric"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            required
          />
          {form.ean.trim() && !eanValid && (
            <p className="mt-1 text-xs text-red-600">
              {codeWord(channel)} must be 6–14 digits.
            </p>
          )}
          {existing && (
            <p className="mt-1 text-xs text-amber-600">
              ⚠ Already in catalog as &ldquo;{existing.name}&rdquo; — stock will be
              added to it.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="np-name" className={labelClass}>
            Product name *
          </label>
          <input
            id="np-name"
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Shanya Crystal Hook"
            required
          />
        </div>
        <div>
          <label htmlFor="np-quantity" className={labelClass}>
            Quantity (pieces) *
          </label>
          <input
            id="np-quantity"
            type="number"
            min={1}
            step={1}
            className={inputClass}
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="100"
            required
          />
        </div>
        <div>
          <label htmlFor="np-vendor" className={labelClass}>
            Vendor name *
          </label>
          <input
            id="np-vendor"
            list="np-vendor-list"
            className={inputClass}
            value={form.vendorName}
            onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
            placeholder="Pick or type a vendor…"
            autoComplete="off"
            required
          />
          <datalist id="np-vendor-list">
            {vendors.map((v) => (
              <option key={v.id} value={v.name} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="np-bill" className={labelClass}>
            Bill no. *
          </label>
          <input
            id="np-bill"
            className={inputClass}
            value={form.bill}
            onChange={(e) => setForm({ ...form, bill: e.target.value })}
            placeholder="e.g. BILL-2026-001"
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label htmlFor="np-date" className={labelClass}>
            Date *
          </label>
          <input
            id="np-date"
            type="date"
            className={inputClass}
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
        </div>
        <div>
          <label htmlFor="np-price" className={labelClass}>
            Purchase price (per piece)
          </label>
          <input
            id="np-price"
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            value={form.purchasePrice}
            onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
            placeholder="Cost price, optional"
          />
        </div>
        <div>
          <label htmlFor="np-reorder" className={labelClass}>
            Reorder level (low-stock alert)
          </label>
          <input
            id="np-reorder"
            type="number"
            min={0}
            step={1}
            className={inputClass}
            value={form.reorderLevel}
            onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
            placeholder="Optional"
          />
        </div>
      </div>

      {/* Image section */}
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <label className={labelClass}>Product image (optional)</label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-3xl text-slate-300">
            {preview || form.imageUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview || form.imageUrl.trim()}
                alt="preview"
                className="h-full w-full object-cover"
              />
            ) : (
              "🖼️"
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">or paste URL:</span>
              <input
                value={form.imageUrl}
                onChange={(e) => {
                  setForm({ ...form, imageUrl: e.target.value });
                  if (e.target.value) pickImage(null);
                }}
                placeholder="https://…"
                disabled={!!imageFile}
                className={`${inputClass} flex-1 disabled:bg-slate-100`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add product & receive into warehouse"}
        </button>
      </div>
    </form>
  );
}
