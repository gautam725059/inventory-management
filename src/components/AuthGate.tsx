"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/lib/useMe";
import AppShell from "@/components/AppShell";

/** Pages that render without a logged-in user. */
function isPublic(pathname: string): boolean {
  return pathname === "/login";
}

/** Client-side guard wrapped around the whole app. Middleware already blocks
 *  requests with no session cookie; this also catches a *stale* cookie (expired
 *  or server-revoked session) by checking the real user and redirecting. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, loading } = useMe();

  const blocked = !isPublic(pathname) && !loading && !me;

  useEffect(() => {
    if (blocked) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [blocked, pathname, router]);

  if (isPublic(pathname)) return <>{children}</>;

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
