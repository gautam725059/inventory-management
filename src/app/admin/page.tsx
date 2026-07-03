"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMe, logout } from "@/lib/useMe";
import type {
  Approval,
  InventoryValuation,
  ProductValue,
  PublicUser,
  Role,
} from "@/lib/types";

/** Format a number as Indian-rupee currency. */
function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPage() {
  const { me, loading: meLoading } = useMe();
  const isAdmin = me?.role === "admin";
  const canView = me?.role === "admin";

  const [valuation, setValuation] = useState<InventoryValuation | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);

  const PRODUCT_PREVIEW = 4;

  const load = useCallback(async () => {
    setError(null);
    try {
      const reqs: Promise<Response>[] = [
        fetch("/api/admin/valuation"),
        fetch("/api/admin/approvals"),
      ];
      if (isAdmin) reqs.push(fetch("/api/admin/users"));
      const [vRes, aRes, uRes] = await Promise.all(reqs);
      if (!vRes.ok || !aRes.ok) throw new Error("Failed to load admin data.");
      setValuation((await vRes.json()).valuation);
      setApprovals(await aRes.json());
      if (uRes) setUsers(uRes.ok ? await uRes.json() : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, [isAdmin]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  async function decide(id: string, action: "approve" | "reject") {
    setError(null);
    try {
      const res = await fetch(`/api/admin/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update request.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update request.");
    }
  }

  async function savePrice(
    ean: string,
    field: "sellingPrice" | "purchasePrice",
    value: string
  ) {
    setError(null);
    try {
      const res = await fetch(`/api/products/${ean}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value === "" ? 0 : Number(value) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save price.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save price.");
    }
  }

  if (meLoading) {
    return <div className="py-20 text-center text-sm text-slate-400">Loading…</div>;
  }

  // ---- Access gate ---------------------------------------------------------
  if (!canView) {
    return (
      <div className="mx-auto max-w-sm px-5 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Admin Panel</h1>
        <p className="mt-2 text-sm text-slate-500">
          {me
            ? `Your role (${me.role}) doesn't have access to the admin panel.`
            : "Please sign in as an admin to continue."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            ← Dashboard
          </Link>
          {!me && (
            <Link
              href="/login?next=/admin"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    );
  }

  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
          ← Dashboard
        </Link>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>
            {me?.name}
            <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
              {me?.role}
            </span>
          </span>
          <button
            onClick={async () => {
              await logout();
              window.location.href = "/login";
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>

      <header className="mt-3 mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Admin Panel
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Inventory value, purchase value, stock-in approvals
            {isAdmin && ", and users"}.
          </p>
        </div>
        {/* {isAdmin && (
          <Link
            href="/admin/import"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            📥 Bulk Import
          </Link>
        )} */}
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {valuation && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total pieces</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {valuation.totalQuantity.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-emerald-700">
              Product value (selling)
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
              {inr(valuation.totalProductValue)}
            </p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-brand-700">
              Purchase value (cost)
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">
              {inr(valuation.totalPurchaseValue)}
            </p>
          </div>
        </div>
      )}

      {/* Pending approvals */}
      <section className="mb-10">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
          Approvals (stock-in &amp; adjustments)
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {pending.length} pending
            </span>
          )}
        </h2>

        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No requests waiting for approval.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium">By</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Product / EAN</th>
                  <th className="px-4 py-3 text-right font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((a) => {
                  const adj = a.type === "adjust";
                  const ap = a.adjustPayload;
                  const pl = a.payload;
                  return (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {formatDateTime(a.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {a.requestedByName || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            adj
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {adj ? "Adjust" : "Stock In"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {adj
                            ? ap?.productName || "(product)"
                            : pl?.name || "(existing product)"}
                        </div>
                        <div className="text-xs text-slate-400">
                          EAN {adj ? ap?.ean : pl?.ean}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${
                          adj && (ap?.delta ?? 0) < 0 ? "text-red-600" : "text-slate-700"
                        }`}
                      >
                        {adj
                          ? `${(ap?.delta ?? 0) > 0 ? "+" : ""}${ap?.delta ?? 0}`
                          : pl?.quantity}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {adj ? (
                          <>
                            <div>{ap?.reason}</div>
                            {ap?.note && (
                              <div className="text-xs text-slate-400">{ap.note}</div>
                            )}
                          </>
                        ) : (
                          <>
                            <div>{pl?.vendorName}</div>
                            <div className="text-xs text-slate-400">
                              Bill {pl?.bill} · {pl?.date}
                              {typeof pl?.purchasePrice === "number" &&
                                ` · ${inr(pl.purchasePrice)}/pc`}
                            </div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => decide(a.id, "approve")}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => decide(a.id, "reject")}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {decided.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-500 hover:text-slate-700">
              Show {decided.length} decided request{decided.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 space-y-1 text-sm text-slate-500">
              {decided.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      a.status === "approved"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {a.status}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                    {a.type === "adjust" ? "Adjust" : "Stock In"}
                  </span>
                  {a.type === "adjust"
                    ? `${a.adjustPayload?.ean} · ${
                        (a.adjustPayload?.delta ?? 0) > 0 ? "+" : ""
                      }${a.adjustPayload?.delta} (${a.adjustPayload?.reason}) → ${a.warehouseId}`
                    : `${a.payload?.ean} · ${a.payload?.quantity} pcs → ${a.warehouseId}`}
                  {a.decidedByName && (
                    <span className="text-xs text-slate-400">
                      by {a.decidedByName}
                      {a.decidedAt && ` (${formatDateTime(a.decidedAt)})`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Product values */}
      <section className={isAdmin ? "mb-10" : ""}>
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          All products — value &amp; purchase value
        </h2>
        {!valuation || valuation.products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No products yet.
          </div>
        ) : (
          (() => {
            // Show the products with the most inventory first.
            const sorted = [...valuation.products].sort(
              (a, b) => b.quantity - a.quantity
            );
            const shown = showAllProducts
              ? sorted
              : sorted.slice(0, PRODUCT_PREVIEW);
            const hidden = sorted.length - shown.length;
            return (
              <>
                <ProductValueTable
                  products={shown}
                  onSave={savePrice}
                  totalProductValue={valuation.totalProductValue}
                  totalPurchaseValue={valuation.totalPurchaseValue}
                />
                {sorted.length > PRODUCT_PREVIEW && (
                  <div className="mt-3 text-center">
                    <button
                      onClick={() => setShowAllProducts((v) => !v)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-brand-600 shadow-sm transition hover:bg-slate-50"
                    >
                      {showAllProducts
                        ? "Show fewer products"
                        : `More products (${hidden} more)`}
                    </button>
                  </div>
                )}
              </>
            );
          })()
        )}
      </section>

      {/* Users (admin only) */}
      {isAdmin && (
        <UsersSection users={users} onChanged={load} onError={setError} myId={me!.id} />
      )}
    </div>
  );
}

function ProductValueTable({
  products,
  onSave,
  totalProductValue,
  totalPurchaseValue,
}: {
  products: ProductValue[];
  onSave: (
    ean: string,
    field: "sellingPrice" | "purchasePrice",
    value: string
  ) => void | Promise<void>;
  totalProductValue: number;
  totalPurchaseValue: number;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-medium">Product</th>
            <th className="px-4 py-3 text-right font-medium">Qty</th>
            <th className="px-4 py-3 text-right font-medium">Purchase price</th>
            <th className="px-4 py-3 text-right font-medium">Selling price</th>
            <th className="px-4 py-3 text-right font-medium">Purchase value</th>
            <th className="px-4 py-3 text-right font-medium">Product value</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <PriceRow key={p.ean} p={p} onSave={onSave} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
            <td className="px-4 py-3" colSpan={4}>
              Total
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-brand-700">
              {inr(totalPurchaseValue)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
              {inr(totalProductValue)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** An inline editable ₹ price cell with a Save button shown when changed. */
function PriceCell({
  current,
  onSave,
}: {
  current: number;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(current ? String(current) : "");
  const dirty = (Number(value) || 0) !== current;
  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="text-slate-400">₹</span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="0"
        className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular-nums outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      {dirty && (
        <button
          onClick={() => onSave(value)}
          className="rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-brand-700"
        >
          Save
        </button>
      )}
    </div>
  );
}

function PriceRow({
  p,
  onSave,
}: {
  p: ProductValue;
  onSave: (
    ean: string,
    field: "sellingPrice" | "purchasePrice",
    value: string
  ) => void | Promise<void>;
}) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{p.name}</div>
        <div className="text-xs text-slate-400">EAN {p.ean}</div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
        {p.quantity.toLocaleString("en-IN")}
      </td>
      <td className="px-4 py-3">
        <PriceCell
          current={p.purchasePrice}
          onSave={(v) => onSave(p.ean, "purchasePrice", v)}
        />
      </td>
      <td className="px-4 py-3">
        <PriceCell
          current={p.sellingPrice}
          onSave={(v) => onSave(p.ean, "sellingPrice", v)}
        />
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
        {inr(p.purchaseValue)}
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
        {inr(p.productValue)}
      </td>
    </tr>
  );
}

// ---- User management (admin only) ------------------------------------------

const ROLES: Role[] = ["admin", "staff"];

function UsersSection({
  users,
  onChanged,
  onError,
  myId,
}: {
  users: PublicUser[];
  onChanged: () => void | Promise<void>;
  onError: (msg: string) => void;
  myId: string;
}) {
  const [form, setForm] = useState({
    username: "",
    name: "",
    role: "staff" as Role,
    password: "",
    warehouseId: "",
  });
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/warehouses?channel=ecom")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { id: string; name: string }[]) =>
        setWarehouses(
          Array.isArray(d) ? d.map((w) => ({ id: w.id, name: w.name })) : []
        )
      )
      .catch(() => {});
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create user.");
      }
      setForm({ username: "", name: "", role: "staff", password: "", warehouseId: "" });
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setBusy(false);
    }
  }

  async function patchUser(id: string, patch: Record<string, unknown>) {
    onError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update user.");
      }
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update user.");
    }
  }

  async function resetPassword(id: string, username: string) {
    const pw = window.prompt(`New password for ${username}:`);
    if (pw && pw.length >= 4) await patchUser(id, { password: pw });
    else if (pw !== null) onError("Password must be at least 4 characters.");
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-slate-900">Users &amp; roles</h2>

      <form
        onSubmit={createUser}
        className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-6"
      >
        <input
          className={inputClass}
          placeholder="Username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          required
        />
        <input
          className={inputClass}
          placeholder="Full name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          className={inputClass}
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={form.role === "admin" ? "" : form.warehouseId}
          onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
          disabled={form.role === "admin"}
          title={
            form.role === "admin"
              ? "Admins can access all warehouses"
              : "Limit this staff to one warehouse (blank = all)"
          }
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <input
          className={inputClass}
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add user"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {u.name}
                    {u.id === myId && (
                      <span className="ml-2 text-xs text-slate-400">(you)</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">@{u.username}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => patchUser(u.id, { role: e.target.value })}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {u.role === "admin" ? (
                    <span className="text-xs text-slate-400">All</span>
                  ) : (
                    <select
                      value={u.warehouseId ?? ""}
                      onChange={(e) => patchUser(u.id, { warehouseId: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">All</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      u.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {u.active ? "active" : "disabled"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => resetPassword(u.id, u.username)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Reset password
                    </button>
                    <button
                      onClick={() => patchUser(u.id, { active: !u.active })}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                        u.active
                          ? "border-red-200 text-red-600 hover:bg-red-50"
                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      }`}
                    >
                      {u.active ? "Disable" : "Enable"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
