"use client";

import Link from "next/link";

export default function B2BPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
        ← Dashboard
      </Link>

      <div className="mt-8 rounded-2xl border border-indigo-200 bg-linear-to-br from-indigo-50 to-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-600 to-indigo-700 text-3xl shadow-sm shadow-indigo-200">
          🏢
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
          B2B
        </h1>
        <p className="mt-2 text-base font-medium text-indigo-700">
          🚧 Working — coming soon!
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-500">
          The B2B module is under development. It&rsquo;ll be available here
          shortly.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
