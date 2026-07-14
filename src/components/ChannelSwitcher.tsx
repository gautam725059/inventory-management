"use client";

import { useEffect, useState } from "react";
import { channelLabel } from "@/lib/useChannel";
import type { Channel } from "@/lib/types";

const COOKIE = "channel";
const ONE_YEAR = 60 * 60 * 24 * 365;

function readChannel(): Channel {
  if (typeof document === "undefined") return "ecom";
  const m = document.cookie.match(/(?:^|;\s*)channel=(b2b|ecom)/);
  return m?.[1] === "b2b" ? "b2b" : "ecom";
}

/** Switches the whole app between the Shanya (e-com) and B2B channels. The choice is
 *  stored in a cookie that every API route reads, so all data (catalog, vendors,
 *  customers, orders, reports …) is scoped to the active channel. Switching does
 *  a full reload to the dashboard so every page re-fetches in the new channel. */
export default function ChannelSwitcher() {
  // Start at "ecom" for a stable first render, then sync from the cookie.
  const [channel, setChannel] = useState<Channel>("ecom");
  useEffect(() => setChannel(readChannel()), []);

  function switchTo(next: Channel) {
    if (next === channel) return;
    document.cookie = `${COOKIE}=${next}; path=/; max-age=${ONE_YEAR}`;
    window.location.assign("/");
  }

  const options: { value: Channel; label: string; icon: string }[] = [
    { value: "ecom", label: channelLabel("ecom"), icon: "🛒" },
    { value: "b2b", label: channelLabel("b2b"), icon: "🏢" },
  ];

  return (
    <div className="px-3 pb-1 pt-3">
      <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Channel
      </div>
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {options.map((o) => {
          const active = channel === o.value;
          return (
            <button
              key={o.value}
              onClick={() => switchTo(o.value)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                active
                  ? o.value === "b2b"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-brand-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>{o.icon}</span>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
