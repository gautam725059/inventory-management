"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicUser } from "./types";

/** Client hook: the currently logged-in user (or null), with a refresh fn. */
export function useMe() {
  const [me, setMe] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setMe(data.user ?? null);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { me, loading, refresh };
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

/** True if the user can act without approval (admin only). */
export function canApprove(me: PublicUser | null): boolean {
  return me?.role === "admin";
}
