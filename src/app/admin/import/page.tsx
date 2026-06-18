"use client";

import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";

interface PreviewProduct {
  ean: string;
  name: string;
  packs: number;
}
interface Summary {
  masters: number;
  validPacks: number;
  skipped: number;
  errors: string[];
}

const SAMPLE = `Name Product\tMaster Ean\tProduct Pack\tProduct Pack EAN\tPack Name\tQty\tPrice
J Hook\t8906212345670\t\t\t\t\t
\t\tJ Hook P10\t8906212345671\tShanya Wall Hooks (Pack of 10)\t\t199
\t\tJ Hook P15\t8906212345672\tShanya Wall Hooks (Pack of 15)\t\t279`;

export default function ImportPage() {
  const { me, loading } = useMe();
  const isAdmin = me?.role === "admin";

  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ summary: Summary; products: PreviewProduct[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function call(previewMode: boolean) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, preview: previewMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      if (previewMode) {
        setPreview({ summary: data.summary, products: data.products });
      } else {
        const r = data.result;
        setDone(
          `Imported ✓  ${r.productsCreated} new products, ${r.productsUpdated} updated, ${r.packsAdded} pack barcodes added.` +
            (data.summary.skipped ? `  (${data.summary.skipped} rows skipped)` : "")
        );
        setPreview(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-slate-400">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-sm px-5 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Bulk Import</h1>
        <p className="mt-2 text-sm text-slate-500">Admin only.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <Link href="/admin" className="text-sm font-medium text-brand-600 hover:underline">
        ← Admin
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bulk Import — products &amp; packs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Paste your sheet (copy from Excel). Master rows create products; pack
          rows (P10/P15…) become pack barcodes with their size, name &amp; price.
        </p>
      </header>

      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Important:</strong> EANs must be full numbers (e.g. <code>8906212345671</code>).
        If Excel shows <code>8.9062E+12</code>, format the EAN column as <strong>Text</strong> or
        save as CSV first — broken EANs are skipped.
      </div>

      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-medium text-slate-600">Paste data (tab or comma separated)</label>
        <button onClick={() => setText(SAMPLE)} className="text-xs font-medium text-brand-600 hover:underline">
          Load sample
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        placeholder="Paste rows here…"
        className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {done && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{done}</div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => call(true)}
          disabled={busy || !text.trim()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? "Working…" : "Preview"}
        </button>
        <button
          onClick={() => call(false)}
          disabled={busy || !text.trim() || !preview}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
          title={!preview ? "Preview first" : ""}
        >
          Import
        </button>
      </div>

      {preview && (
        <div className="mt-6">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Master products" value={preview.summary.masters} tone="brand" />
            <Stat label="Valid packs" value={preview.summary.validPacks} tone="emerald" />
            <Stat label="Skipped rows" value={preview.summary.skipped} tone={preview.summary.skipped ? "red" : "slate"} />
          </div>

          {preview.summary.errors.length > 0 && (
            <details className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <summary className="cursor-pointer font-medium">
                {preview.summary.errors.length} issue(s) — these rows will be skipped
              </summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                {preview.summary.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Primary EAN / key</th>
                  <th className="px-4 py-3 text-right font-medium">Packs</th>
                </tr>
              </thead>
              <tbody>
                {preview.products.map((p) => (
                  <tr key={p.ean} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.ean}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{p.packs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Looks good? Click <strong>Import</strong> to save.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "brand" | "emerald" | "red" | "slate" }) {
  const tones: Record<string, string> = {
    brand: "border-brand-200 bg-brand-50 text-brand-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
    slate: "border-slate-200 bg-white text-slate-900",
  };
  return (
    <div className={`rounded-xl border p-4 text-center shadow-sm ${tones[tone]}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}
