"use client";

import GuideChat from "@/components/GuideChat";

export default function HelpPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col px-5 py-8">
      <header className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Guide</h1>
        <p className="mt-1 text-sm text-slate-500">
          Koi bhi process poochho — &ldquo;stock in kaise kare?&rdquo;,
          &ldquo;maal bahar bhejna&rdquo;, &ldquo;kisne kya kiya&rdquo;. Bot
          step-by-step bata dega.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <GuideChat />
      </div>
    </div>
  );
}
