"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import GuideChat from "@/components/GuideChat";

/** Floating "Guide" button shown on every logged-in page (admin + staff). Opens
 *  the guide in a slide-over so staff can ask without leaving their task.
 *  Hidden on /help itself (the guide is already the whole page there). */
export default function GuideFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on Escape; lock body scroll while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (pathname === "/help") return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open guide"
          className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 hover:shadow-xl"
        >
          <span className="text-lg">📖</span>
          <span className="hidden sm:inline">Guide</span>
        </button>
      )}

      {/* Slide-over panel */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-slate-50 shadow-2xl animate-fade-in-up sm:w-[26rem]">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-base">
                  📖
                </span>
                <span className="text-sm font-bold text-slate-900">Guide</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close guide"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 p-4">
              <GuideChat onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
