// ---------------------------------------------------------------------------
// Core domain: warehouses hold stock of products, identified by EAN.
// Goods are received in bulk (individual pieces) and sold in combos / packs
// (e.g. a pack of 10 or 5 pieces).
// ---------------------------------------------------------------------------

export interface Warehouse {
  id: string;
  name: string;
  location: string;
}

/** A product is identified by its EAN barcode. Combo sizes are pack sizes it
 *  can be sold in, e.g. [10, 5] = sold as packs of 10 or packs of 5 pieces. */
export interface Product {
  ean: string;
  name: string;
  comboSizes: number[];
  /** Low-stock threshold. When stock falls to/below this, it's flagged for
   *  re-order. 0 = no alert. */
  reorderLevel: number;
  /** Optional product image: an uploaded path (/uploads/…) or an external URL. */
  imageUrl?: string;
}

/** Quantity (in base pieces) of one product held in one warehouse. */
export interface StockRow {
  warehouseId: string;
  ean: string;
  quantity: number;
}

/** Audit log entry: a batch of goods received into a warehouse (bulk stock-in). */
export interface Receipt {
  id: string;
  warehouseId: string;
  ean: string;
  quantity: number;
  createdAt: string;
}

/** Audit log entry: goods dispatched out of a warehouse as packs (stock-out). */
export interface Dispatch {
  id: string;
  warehouseId: string;
  ean: string;
  unitSize: number; // pieces per pack (1 = single)
  packs: number;
  quantity: number; // total pieces removed = unitSize * packs
  createdAt: string;
}

/** The whole persisted store. */
export interface Store {
  warehouses: Warehouse[];
  products: Product[];
  stock: StockRow[];
  receipts: Receipt[];
  dispatches: Dispatch[];
}

// ---- Computed / view shapes returned by the API -----------------------------

/** How many full packs of a given size the current stock can make. */
export interface ComboAvailability {
  size: number;
  packs: number; // floor(quantity / size)
  leftover: number; // quantity % size
}

/** A product line inside a warehouse, joined with stock + combo math. */
export interface WarehouseStockLine {
  ean: string;
  name: string;
  quantity: number;
  comboSizes: number[];
  combos: ComboAvailability[];
  reorderLevel: number;
  lowStock: boolean; // quantity <= reorderLevel (and reorderLevel > 0)
  imageUrl?: string;
}

/** Dashboard summary for one warehouse. */
export interface WarehouseSummary extends Warehouse {
  skuCount: number;
  totalUnits: number;
  lowStockCount: number;
}

/** How much of a product sits in one warehouse (for the catalog view). */
export interface WarehouseStockBit {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

/** A catalog row: one distinct product with stock totalled across warehouses. */
export interface ProductCatalogEntry {
  ean: string;
  name: string;
  comboSizes: number[];
  reorderLevel: number;
  totalQuantity: number;
  lowStock: boolean; // total <= reorderLevel (and reorderLevel > 0)
  byWarehouse: WarehouseStockBit[];
  imageUrl?: string;
}

/** A unified stock movement (in or out) for the history view. */
export interface Movement {
  id: string;
  type: "in" | "out";
  ean: string;
  name: string;
  quantity: number; // pieces moved
  unitSize?: number; // out only: pieces per pack
  packs?: number; // out only: number of packs
  createdAt: string;
}

/** Full warehouse detail payload. */
export interface WarehouseDetail extends Warehouse {
  lines: WarehouseStockLine[];
  totalUnits: number;
}

/** Body accepted by the "receive goods" (stock-in) endpoint. */
export interface ReceiveInput {
  ean: string;
  quantity: number;
  name?: string;
  comboSizes?: number[];
  reorderLevel?: number;
}

/** Body accepted by the "dispatch goods" (stock-out) endpoint. */
export interface DispatchInput {
  ean: string;
  unitSize: number; // pieces per pack (1 = single)
  packs: number;
}

/** Body accepted by the "update product" endpoint. Any field may be omitted. */
export interface ProductUpdateInput {
  name?: string;
  comboSizes?: number[];
  reorderLevel?: number;
  imageUrl?: string; // empty string clears the image
}
