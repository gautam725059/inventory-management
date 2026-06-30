"use client";

import { useState } from "react";

interface Props {
  ean: string;
  name: string;
  imageUrl: string;
  isAdmin: boolean;
  onClose: () => void;
  /** Admin only: open the editor to change the image. */
  onEdit: () => void;
  /** Called after the image is deleted so the parent can reload. */
  onDeleted: () => void | Promise<void>;
}

/** Full-size image preview. Clicking a product image opens this. Admins get
 *  Edit / Delete actions below the image. */
export default function ImageViewer({
  ean,
  name,
  imageUrl,
  isAdmin,
  onClose,
  onEdit,
  onDeleted,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm("Delete this product image?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${ean}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: "" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete image.");
      }
      await onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{name}</div>
            <div className="font-mono text-xs text-slate-400">{ean}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            ✕ Close
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={name}
            className="max-h-[65vh] w-auto max-w-full rounded-lg object-contain"
          />
        </div>

        {error && (
          <div className="border-t border-red-100 bg-red-50 px-5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {isAdmin && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <button
              onClick={onEdit}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              ✏ Edit image
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              {busy ? "Deleting…" : "🗑 Delete image"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
