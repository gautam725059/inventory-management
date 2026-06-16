"use client";

import PartyManager from "@/components/PartyManager";

export default function CustomersPage() {
  return (
    <PartyManager
      kind="customer"
      apiBase="/api/customers"
      title="Customers"
      subtitle="Buyers you sell stock to, with sales history."
      refLabel="Invoice"
    />
  );
}
