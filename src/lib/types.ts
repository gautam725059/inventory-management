// ---------------------------------------------------------------------------
// Core domain: warehouses hold stock of products, identified by EAN.
// Goods are received in bulk (individual pieces) and sold in combos / packs
// (e.g. a pack of 10 or 5 pieces).
// ---------------------------------------------------------------------------

// ---- Users & auth -----------------------------------------------------------

/** Access levels. admin = full control; staff = data entry only (stock-in
 *  needs admin approval). */
export type Role = "admin" | "staff";

export interface User {
  id: string;
  username: string; // unique login handle
  name: string; // display name
  role: Role;
  passwordHash: string; // scrypt hash "salt:hash"
  active: boolean; // disabled users can't log in
  createdAt: string;
}

/** A logged-in session, keyed by an opaque token stored in an httpOnly cookie. */
export interface Session {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

/** Safe, public view of a user (never exposes the password hash). */
export interface PublicUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

/** Sales channel a warehouse serves. ecom = online / e-commerce stock,
 *  b2b = wholesale / business stock. The same physical location can appear once
 *  per channel; their inventory is tracked completely separately. */
export type Channel = "ecom" | "b2b";

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  channel: Channel;
}

// ---- Parties: vendors (suppliers) & customers -------------------------------

/** Shared fields for a business party. */
interface PartyBase {
  id: string;
  name: string;
  phone?: string;
  gstin?: string; // tax id
  address?: string;
  note?: string;
  channel: Channel; // which sales channel this party belongs to
  createdAt: string;
}

/** A supplier the goods are bought from (stock-in). */
export type Vendor = PartyBase;
/** A buyer the goods are sold to (stock-out). */
export type Customer = PartyBase;

/** Body accepted by the create/update party endpoints. */
export interface PartyInput {
  name?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  note?: string;
}

/** One transaction row in a party's history. */
export interface PartyTxn {
  id: string;
  date: string; // user date if present, else createdAt
  ean: string;
  productName: string;
  quantity: number;
  ref?: string; // bill no (vendor) or invoice no (customer)
  amount?: number; // line value if a price is known
  warehouseName: string;
}

/** A vendor with its purchase history. */
export interface VendorDetail extends PartyBase {
  txns: PartyTxn[];
  totalQuantity: number;
  totalValue: number;
}

/** A customer with its sales history. */
export interface CustomerDetail extends PartyBase {
  txns: PartyTxn[];
  totalQuantity: number;
}

/** A scannable barcode for a specific pack of a product. The product's own
 *  `ean` is its primary barcode; these are extra barcodes that each resolve to
 *  a pack size, e.g. { ean: "…001", size: 10 } = the barcode for a pack of 10. */
export interface PackBarcode {
  ean: string;
  size: number; // pieces in this pack (1 = single)
  name?: string; // optional pack/listing name (e.g. an Amazon title)
  price?: number; // optional selling price for this specific pack
}

/** A product is identified by its EAN barcode. Combo sizes are pack sizes it
 *  can be sold in, e.g. [10, 5] = sold as packs of 10 or packs of 5 pieces. */
export interface Product {
  ean: string;
  /** Sales channel this product's catalog entry belongs to. The same EAN can
   *  exist once per channel as separate records (separate e-com / B2B catalogs). */
  channel: Channel;
  name: string;
  /** Optional brand (e.g. "Philips") — used to group products on the dashboard. */
  brand?: string;
  comboSizes: number[];
  /** Extra barcodes — one EAN per pack size (pack of 10, pack of 5, single …).
   *  Scanning any of these in stock-out auto-fills the matching pack size. */
  barcodes: PackBarcode[];
  /** Low-stock threshold. When stock falls to/below this, it's flagged for
   *  re-order. 0 = no alert. */
  reorderLevel: number;
  /** Selling price per piece (set on the product). Drives "product value". */
  sellingPrice?: number;
  /** Latest purchase (cost) price per piece, updated on each stock-in. Drives
   *  "purchase value". */
  purchasePrice?: number;
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
  bill?: string; // supplier bill / invoice number for this receipt
  vendorName?: string; // who the goods were bought from
  vendorId?: string; // linked vendor master record
  date?: string; // received date (YYYY-MM-DD) entered by the user
  purchasePrice?: number; // cost price per piece for this batch
  createdAt: string;
}

/** Manual stock correction (damage, expiry, count fix, …). delta is signed. */
export interface Adjustment {
  id: string;
  warehouseId: string;
  ean: string;
  delta: number; // signed change in pieces (e.g. -3 or +5)
  reason: string;
  note?: string;
  byId?: string;
  byName?: string;
  createdAt: string;
}

/** Movement of stock from one warehouse to another. */
export interface Transfer {
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  ean: string;
  quantity: number; // pieces moved (positive)
  note?: string;
  byId?: string;
  byName?: string;
  createdAt: string;
}

/** Payload for a stock-adjustment approval request. */
export interface AdjustPayload {
  ean: string;
  productName?: string; // display snapshot at request time
  delta: number; // signed (+ add / − remove)
  reason: string;
  note?: string;
}

/** A regular user's request awaiting admin approval — a stock-in (receive) or a
 *  stock adjustment. */
export interface Approval {
  id: string;
  type: "receive" | "adjust";
  warehouseId: string;
  payload?: ReceiveInput; // present for type "receive"
  adjustPayload?: AdjustPayload; // present for type "adjust"
  status: "pending" | "approved" | "rejected";
  requestedBy?: string; // user id who submitted it
  requestedByName?: string; // display name snapshot
  decidedBy?: string; // user id who approved/rejected
  decidedByName?: string;
  createdAt: string;
  decidedAt?: string;
}

/** Audit log entry: goods dispatched out of a warehouse as packs (stock-out). */
export interface Dispatch {
  id: string;
  warehouseId: string;
  ean: string;
  unitSize: number; // pieces per pack (1 = single)
  packs: number;
  quantity: number; // total pieces removed = unitSize * packs
  date?: string; // dispatch date (YYYY-MM-DD) entered by the user
  invoiceNo?: string; // invoice number for this dispatch
  referenceNo?: string; // optional reference number (PO/order/ref)
  customerName?: string; // who the goods were sold to
  customerId?: string; // linked customer master record
  createdAt: string;
}

// ---- Combos: bundles of different products sold together --------------------

/** One line in a combo recipe: how many pieces of a product go into one combo. */
export interface ComboComponent {
  ean: string; // a product's primary EAN
  quantity: number; // pieces of that product per single combo
}

/** A sellable bundle of different products, e.g. 1 J Hook + 1 Frame Hook +
 *  1 Nut Hook. Selling a combo deducts each component from stock; combos are
 *  not stocked themselves — they're built from on-hand pieces. */
export interface Combo {
  id: string;
  channel: Channel; // which sales channel this combo belongs to
  name: string;
  barcode?: string; // optional scannable EAN for the whole combo
  price?: number; // optional combo selling price
  components: ComboComponent[];
  createdAt: string;
}

/** Body accepted by the create/update combo endpoints. */
export interface ComboInput {
  name?: string;
  barcode?: string;
  price?: number;
  components?: ComboComponent[];
}

/** A combo joined with its component product names + per-warehouse buildable
 *  count (how many combos the least-stocked component allows). */
export interface ComboView extends Combo {
  lines: {
    ean: string;
    name: string;
    quantity: number; // per combo
  }[];
}

/** One component's contribution to a combo sale (snapshot at sale time). */
export interface ComboDispatchComponent {
  ean: string;
  name: string;
  quantity: number; // per combo
  pieces: number; // total removed = quantity * combos
}

/** Audit log entry: a batch of combos dispatched out of a warehouse. The stock
 *  of each component is reduced; the combo itself is not a stock item. */
export interface ComboDispatch {
  id: string;
  warehouseId: string;
  comboId: string;
  comboName: string; // snapshot
  barcode?: string;
  combos: number; // number of combos sold
  price?: number; // combo unit price snapshot
  amount?: number; // price * combos, if a price is known
  components: ComboDispatchComponent[];
  totalPieces: number; // sum of all component pieces removed
  date?: string;
  invoiceNo?: string;
  referenceNo?: string;
  customerName?: string;
  customerId?: string;
  createdAt: string;
}

/** Body accepted by the "dispatch combo" endpoint. */
export interface ComboDispatchInput {
  comboId: string;
  combos: number;
  date: string;
  invoiceNo: string;
  referenceNo?: string;
  customerName?: string;
}

/** The whole persisted store. */
// ---- Purchase Orders --------------------------------------------------------

/** One line on a purchase order. Carton/qty/tax totals are computed on save. */
export interface POLineItem {
  hsnCode?: string;
  ean: string; // Product UPC
  productCode?: string;
  description: string;
  cartonSize: number; // pieces per carton
  cartonQty: number; // number of cartons
  totalQty: number; // cartonSize * cartonQty
  rate: number; // price per piece (pre-tax)
  taxRate: number; // %
  taxAmount: number; // per-unit tax = rate * taxRate / 100
  amount: number; // per-unit incl tax = rate + taxAmount
  totalAmount: number; // amount * totalQty
}

/** A purchase order raised to a vendor. Staff orders need admin approval before
 *  they are confirmed; admins create confirmed orders directly. Confirming does
 *  NOT add stock — goods are received separately via Stock In when they arrive. */
export interface PurchaseOrder {
  id: string;
  channel: Channel; // which sales channel this PO belongs to
  poNumber: string; // e.g. PO-0001
  date: string; // YYYY-MM-DD
  warehouseId?: string; // where goods will be received
  vendorName: string;
  vendorId?: string;
  invoiceNumber?: string;
  items: POLineItem[];
  grandTotal: number;
  /** pending → awaiting admin approval. confirmed → approved, goods "on the way".
   *  received → goods stocked into inventory. rejected → declined. */
  status: "pending" | "confirmed" | "rejected" | "received";
  requestedBy?: string;
  requestedByName?: string;
  decidedBy?: string;
  decidedByName?: string;
  createdAt: string;
  decidedAt?: string;
  /** Set when the PO's goods are received into inventory (status → received). */
  receivedAt?: string;
  receivedByName?: string;
}

/** A line item as submitted by the form (totals are derived server-side). */
export interface POLineInput {
  hsnCode?: string;
  ean: string;
  productCode?: string;
  description: string;
  cartonSize: number;
  cartonQty: number;
  rate: number;
  taxRate: number;
}

/** Body accepted by the create-purchase-order endpoint. */
export interface PurchaseOrderInput {
  date: string;
  warehouseId?: string;
  vendorName: string;
  invoiceNumber?: string;
  items: POLineInput[];
}

export interface Store {
  users: User[];
  sessions: Session[];
  warehouses: Warehouse[];
  products: Product[];
  vendors: Vendor[];
  customers: Customer[];
  stock: StockRow[];
  receipts: Receipt[];
  dispatches: Dispatch[];
  comboDispatches: ComboDispatch[];
  adjustments: Adjustment[];
  transfers: Transfer[];
  approvals: Approval[];
  combos: Combo[];
  purchaseOrders: PurchaseOrder[];
  releaseOrders: ReleaseOrder[];
}

// ---- Release Orders (incoming platform orders → stock-out) ------------------

/** One line on a release order (e.g. a Blinkit order). Tax/total are computed
 *  on save; the landing rate is treated as tax-inclusive. */
export interface ROLineItem {
  itemCode?: string;
  ean: string; // Product UPC
  description: string;
  grammage?: string; // "1 pc" / "1 unit" / "1 set"
  gstRate: number; // total GST % (CGST + SGST, or IGST)
  taxAmount: number; // per-unit tax within the landing rate
  landingRate: number; // tax-inclusive rate per unit
  quantity: number;
  mrp?: number;
  totalAmount: number; // landingRate * quantity
}

/** A release order fulfilled by stock-out. Saving an RO deducts each line's
 *  quantity from the warehouse (all-or-nothing) and logs a dispatch. */
export interface ReleaseOrder {
  id: string;
  channel: Channel; // which sales channel this RO belongs to
  roNumber: string; // RO-0001
  date: string; // YYYY-MM-DD
  source?: string; // Blinkit / other platform
  warehouseId: string;
  customerName?: string;
  items: ROLineItem[];
  totalQuantity: number;
  totalAmount: number;
  cartDiscount: number;
  netAmount: number;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
}

/** A release-order line as submitted by the form (totals derived server-side). */
export interface ROLineInput {
  itemCode?: string;
  ean: string;
  description?: string;
  grammage?: string;
  gstRate?: number;
  landingRate?: number;
  quantity: number;
  mrp?: number;
}

/** Body accepted by the create-release-order endpoint. */
export interface ReleaseOrderInput {
  date: string;
  source?: string;
  warehouseId: string;
  customerName?: string;
  cartDiscount?: number;
  lines: ROLineInput[];
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
  barcodes: PackBarcode[]; // pack barcodes for scanning in stock-out
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
  brand?: string;
  comboSizes: number[];
  barcodes: PackBarcode[];
  reorderLevel: number;
  sellingPrice?: number;
  purchasePrice?: number;
  totalQuantity: number;
  lowStock: boolean; // total <= reorderLevel (and reorderLevel > 0)
  byWarehouse: WarehouseStockBit[];
  imageUrl?: string;
}

/** One product's valuation row for the admin panel. */
export interface ProductValue {
  ean: string;
  name: string;
  quantity: number; // total pieces across all warehouses
  sellingPrice: number; // 0 if unset
  purchasePrice: number; // 0 if unset
  productValue: number; // quantity * sellingPrice
  purchaseValue: number; // quantity * purchasePrice
}

/** Whole-inventory valuation returned to the admin panel. */
export interface InventoryValuation {
  products: ProductValue[];
  totalQuantity: number;
  totalProductValue: number;
  totalPurchaseValue: number;
}

// ---- Reports ----------------------------------------------------------------

export interface ReportProductRow {
  ean: string;
  name: string;
  soldUnits: number;
  revenue: number;
  purchasedUnits: number;
  spend: number;
  profit: number; // revenue − COGS for the units sold
}

export interface ReportMonthly {
  month: string; // "YYYY-MM"
  salesRevenue: number;
  purchaseSpend: number;
  salesUnits: number;
}

export interface LowStockRow {
  ean: string;
  name: string;
  warehouseName: string;
  quantity: number;
  reorderLevel: number;
}

/** Business report over an optional date range. Revenue/COGS use the product's
 *  current selling/purchase prices; purchase spend uses each receipt's recorded
 *  cost. */
export interface Report {
  from?: string;
  to?: string;
  sales: {
    units: number;
    revenue: number;
    cogs: number;
    profit: number;
    marginPct: number;
    count: number;
  };
  purchases: { units: number; spend: number; count: number };
  inventory: {
    totalQuantity: number;
    totalProductValue: number;
    totalPurchaseValue: number;
  };
  byProduct: ReportProductRow[];
  monthly: ReportMonthly[];
  lowStock: LowStockRow[];
}

/** One purchase (stock-in) of a product, for the dashboard purchase lookup. */
export interface PurchaseHistoryEntry {
  date: string;
  warehouseName: string;
  quantity: number;
  price?: number; // cost per piece, if recorded
  amount?: number; // price * quantity
  vendorName?: string;
  bill?: string;
}

/** All purchases of one product (in a channel), newest first. */
export interface ProductPurchaseHistory {
  ean: string; // resolved primary code (EAN / 12NC)
  name: string;
  totalQuantity: number;
  totalValue: number;
  entries: PurchaseHistoryEntry[];
}

/** A unified stock movement for the history view. */
export interface Movement {
  id: string;
  type: "in" | "out" | "adjust" | "transfer-in" | "transfer-out" | "combo-out";
  ean: string;
  name: string;
  quantity: number; // pieces moved (signed for "adjust", positive otherwise)
  unitSize?: number; // out only: pieces per pack
  packs?: number; // out / combo-out: number of packs / combos
  date?: string; // user-entered date (dispatch date for out, received date for in)
  invoiceNo?: string; // out / combo-out: invoice number
  referenceNo?: string; // out / combo-out: reference number
  bill?: string; // in only: supplier bill number
  vendorName?: string; // in only: vendor the goods came from
  customerName?: string; // out / combo-out: customer the goods were sold to
  reason?: string; // adjust only
  note?: string; // adjust / transfer
  counterparty?: string; // transfer only: the other warehouse's name
  comboItems?: string; // combo-out only: "J Hook ×5, Frame Hook ×5"
  byName?: string; // who performed it (adjust / transfer)
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
  bill: string; // supplier bill / invoice number
  vendorName: string; // vendor the goods were bought from
  date: string; // received date (YYYY-MM-DD)
  purchasePrice?: number; // cost price per piece
}

/** Body accepted by the "dispatch goods" (stock-out) endpoint. The `ean` may be
 *  a product's primary EAN or any of its pack barcodes — it is resolved to the
 *  product and its pack size server-side. */
export interface DispatchInput {
  ean: string;
  unitSize: number; // pieces per pack (1 = single)
  packs: number;
  date: string; // dispatch date (YYYY-MM-DD)
  invoiceNo: string; // invoice number
  referenceNo?: string; // optional reference number (PO/order/ref)
  customerName?: string; // who the goods were sold to (optional)
}

/** One line of a bulk (multi-product) stock-out. */
export interface BulkDispatchLine {
  ean: string;
  unitSize: number; // pieces per pack (1 = single)
  packs: number;
}

/** Body accepted by the bulk "dispatch goods" endpoint. The date / invoice /
 *  customer are shared across all lines. */
export interface BulkDispatchInput {
  date: string;
  invoiceNo: string;
  referenceNo?: string;
  customerName?: string;
  lines: BulkDispatchLine[];
}

export interface BulkDispatchResult {
  dispatched: number; // number of lines dispatched
  totalPieces: number;
}

/** One master product + its packs, for the bulk catalog import. */
export interface ImportItem {
  ean: string; // master/primary EAN (or a generated key when none is given)
  name: string;
  brand?: string; // optional brand to tag the product with
  barcodes: PackBarcode[];
  /** Pack sizes (>1) from pack rows that have no barcode of their own — e.g.
   *  "P10/P15/P20" become comboSizes [10,15,20] the product can be sold in. */
  comboSizes?: number[];
}

export interface ImportResult {
  productsCreated: number;
  productsUpdated: number;
  packsAdded: number;
}

/** Body accepted by the "update product" endpoint. Any field may be omitted. */
export interface ProductUpdateInput {
  name?: string;
  comboSizes?: number[];
  barcodes?: PackBarcode[];
  reorderLevel?: number;
  sellingPrice?: number;
  purchasePrice?: number;
  imageUrl?: string; // empty string clears the image
}
