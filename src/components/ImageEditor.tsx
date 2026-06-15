"use client";

import { useState } from "react";

interface Props {
  ean: string;
  name: string;
  imageUrl?: string;
  onClose: () => void;
  /** Called after the image changes so the parent can reload. */
  onSaved: () => void | Promise<void>;
}

/** Modal to set a product image — upload a file or paste an image URL. */
export default function ImageEditor({ ean, name, imageUrl, onClose, onSaved }: Props) {
  const [url, setUrl] = useState(imageUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/products/${ean}/image`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed.");
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setImageUrl(value: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${ean}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save image.");
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">Product image</h3>
        <p className="mt-0.5 text-sm text-slate-500">{name}</p>

        <div className="mt-4 flex justify-center">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={name}
              className="h-40 w-40 rounded-lg border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-4xl text-slate-300">
              🖼️
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Upload from your device
          </label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
          />
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            …or paste an image URL
          </label>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              disabled={busy}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <button
              onClick={() => setImageUrl(url.trim())}
              disabled={busy || !url.trim()}
              className="whitespace-nowrap rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              Use URL
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setImageUrl("")}
            disabled={busy || !imageUrl}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40"
          >
            Remove image
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
