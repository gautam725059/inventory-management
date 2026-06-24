"use client";

import { useEffect } from "react";

/** Legacy entry point: switches the app into B2B mode (sets the channel cookie)
 *  and sends the user to the dashboard. The persistent channel switch lives in
 *  the sidebar. */
export default function B2BPage() {
  useEffect(() => {
    document.cookie = `channel=b2b; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.replace("/");
  }, []);

  return (
    <div className="py-16 text-center text-sm text-slate-400">
      Switching to B2B…
    </div>
  );
}
