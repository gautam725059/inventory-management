"use client";

import PartyManager from "@/components/PartyManager";

export default function VendorsPage() {
  return (
    <PartyManager
      kind="vendor"
      apiBase="/api/vendors"
      title="Vendors"
      subtitle="Suppliers you buy stock from, with purchase history."
      refLabel="Bill"
    />
  );
}
