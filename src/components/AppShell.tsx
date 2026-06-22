"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMe, logout } from "@/lib/useMe";
import type { PublicUser } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/catalog", label: "Catalog", icon: "📦" },
  { href: "/combos", label: "Combos", icon: "🎁" },
  { href: "/vendors", label: "Vendors", icon: "🏭" },
  { href: "/customers", label: "Customers", icon: "🧾" },
  { href: "/purchase-orders", label: "Purchase Orders", icon: "🛒" },
  { href: "/reports", label: "Reports", icon: "📊", adminOnly: true },
  { href: "/admin", label: "Admin", icon: "🔐", adminOnly: true },
];

const roleBadge: Record<string, string> = {
  admin: "bg-brand-100 text-brand-700",
  staff: "bg-slate-200 text-slate-600",
};

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Persistent app chrome: a branded sidebar (drawer on mobile) + top bar,
 *  wrapped around every authenticated page. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { me } = useMe();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isAdmin = me?.role === "admin";
  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="min-h-screen">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-brand-600 to-brand-800 text-lg shadow-sm">
            📦
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-900">Inventory</div>
            <div className="text-xs text-slate-400">Management</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`group/nav relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-linear-to-r from-brand-50 to-transparent text-brand-700 ring-1 ring-brand-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" />
                )}
                <span className={`text-base transition-transform ${active ? "" : "group-hover/nav:scale-110"}`}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <UserCard me={me} />
      </aside>

      {/* Main column */}
      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-sm sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 md:hidden"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="text-sm font-semibold text-slate-700 md:hidden">
            Inventory
          </div>
          <div className="ml-auto flex items-center gap-2">
            {me && (
              <span className="hidden text-sm text-slate-600 sm:inline">
                {me.name}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    roleBadge[me.role] ?? "bg-slate-200 text-slate-600"
                  }`}
                >
                  {me.role}
                </span>
              </span>
            )}
          </div>
        </header>

        <main className="animate-fade-in-up">{children}</main>
      </div>
    </div>
  );
}

function UserCard({ me }: { me: PublicUser | null }) {
  const router = useRouter();
  async function signOut() {
    await logout();
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="border-t border-slate-200 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
          {(me?.name ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-slate-900">
            {me?.name ?? "—"}
          </div>
          <div className="truncate text-xs capitalize text-slate-400">
            {me?.role ?? ""}
          </div>
        </div>
      </div>
      <button
        onClick={signOut}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
      >
        Sign out
      </button>
    </div>
  );
}
