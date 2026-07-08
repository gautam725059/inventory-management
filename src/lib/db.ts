import { promises as fs } from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import { hashPassword } from "./password";
import { adminPassword } from "./admin";
import { mongoEnabled, mongoReadStoreDoc, mongoWriteStore } from "./mongo";
import type {
  Store,
  User,
  Session,
  PublicUser,
  Role,
  Channel,
  Warehouse,
  Product,
  PackBarcode,
  WarehouseSummary,
  WarehouseDetail,
  WarehouseStockLine,
  ComboAvailability,
  Movement,
  ProductCatalogEntry,
  ProductPurchaseHistory,
  ReceiveInput,
  DispatchInput,
  BulkReceiveInput,
  BulkReceiveResult,
  BulkDispatchInput,
  BulkDispatchResult,
  ProductUpdateInput,
  Approval,
  AdjustPayload,
  Adjustment,
  Transfer,
  Vendor,
  Customer,
  PartyInput,
  PartyTxn,
  VendorDetail,
  CustomerDetail,
  InventoryValuation,
  ProductValue,
  Report,
  ReportProductRow,
  ReportMonthly,
  LowStockRow,
  StockAgingRow,
  ImportItem,
  ImportResult,
  Combo,
  ComboComponent,
  ComboInput,
  ComboView,
  ComboDispatch,
  ComboDispatchComponent,
  ComboDispatchInput,
  PurchaseOrder,
  POLineItem,
  POLineInput,
  PurchaseOrderInput,
  ReleaseOrder,
  ROLineItem,
  ReleaseOrderInput,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

// The warehouses are seeded on first run. Each (warehouse × channel) holds its
// own, separate stock. The same physical locations exist once for e-commerce
// and once for B2B, so B2B inventory never mixes with the e-com inventory.
const DEFAULT_WAREHOUSES: Warehouse[] = [
  // E-commerce channel
  { id: "wh-mumbai", name: "Mumbai Warehouse", location: "Bhiwandi, MH", channel: "ecom" },
  { id: "wh-delhi", name: "Haryana Warehouse", location: "Farrukhnagar, HR", channel: "ecom" },
  { id: "wh-bengaluru", name: "Bengaluru Warehouse", location: "Whitefield, KA", channel: "ecom" },
  // B2B channel
  { id: "wh-mumbai-b2b", name: "Mumbai Warehouse", location: "Bhiwandi, MH", channel: "b2b" },
  { id: "wh-delhi-b2b", name: "Haryana Warehouse", location: "Farrukhnagar, HR", channel: "b2b" },
  { id: "wh-bengaluru-b2b", name: "Bengaluru Warehouse", location: "Whitefield, KA", channel: "b2b" },
];

/** Coerce stored warehouses into a clean list: default a missing channel to
 *  "ecom" (older records), then ensure every default warehouse — including the
 *  B2B ones added later — exists, so existing stores gain the B2B warehouses. */
function normalizeWarehouses(raw: unknown): Warehouse[] {
  const stored = Array.isArray(raw) ? (raw as Partial<Warehouse>[]) : [];
  const out: Warehouse[] = stored
    .filter((w) => w && typeof w.id === "string")
    .map((w) => ({
      id: w.id as string,
      name: typeof w.name === "string" ? w.name : (w.id as string),
      location: typeof w.location === "string" ? w.location : "",
      channel: w.channel === "b2b" ? "b2b" : "ecom",
    }));
  for (const d of DEFAULT_WAREHOUSES) {
    if (!out.some((w) => w.id === d.id)) out.push({ ...d });
  }
  return out;
}

function emptyStore(): Store {
  return {
    users: [],
    sessions: [],
    warehouses: DEFAULT_WAREHOUSES.map((w) => ({ ...w })),
    vendors: [],
    customers: [],
    products: [],
    stock: [],
    receipts: [],
    dispatches: [],
    comboDispatches: [],
    adjustments: [],
    transfers: [],
    approvals: [],
    combos: [],
    purchaseOrders: [],
    releaseOrders: [],
  };
}

/** Coerce arbitrary stored data into a clean PackBarcode[] — drops malformed
 *  rows and keeps only positive whole-number pack sizes with a non-empty EAN. */
function normalizeBarcodes(raw: unknown): PackBarcode[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PackBarcode[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const b = item as Record<string, unknown>;
    const ean = typeof b.ean === "string" ? b.ean.trim() : "";
    const size = Number(b.size);
    if (!ean || seen.has(ean) || !Number.isInteger(size) || size <= 0) continue;
    seen.add(ean);
    const name = typeof b.name === "string" ? b.name.trim() || undefined : undefined;
    const price =
      typeof b.price === "number" && b.price >= 0 ? b.price : undefined;
    out.push({ ean, size, name, price });
  }
  return out;
}

// Serialize writes so concurrent requests can't clobber the file.
let writeChain: Promise<unknown> = Promise.resolve();

/** Coerce a raw parsed object (from JSON file or Mongo) into a full, normalized
 *  Store, filling in newer fields on older records. */
function normalizeStore(parsed: Partial<Store>): Store {
  return {
    warehouses: normalizeWarehouses(parsed.warehouses),
    // Normalize products so older records gain the newer fields.
    products: Array.isArray(parsed.products)
      ? parsed.products.map((p) => ({
          ...p,
          channel: p.channel === "b2b" ? "b2b" : "ecom",
          brand: typeof p.brand === "string" ? p.brand : undefined,
          comboSizes: Array.isArray(p.comboSizes) ? p.comboSizes : [],
          barcodes: normalizeBarcodes(p.barcodes),
          reorderLevel: typeof p.reorderLevel === "number" ? p.reorderLevel : 0,
          sellingPrice:
            typeof p.sellingPrice === "number" ? p.sellingPrice : undefined,
          purchasePrice:
            typeof p.purchasePrice === "number" ? p.purchasePrice : undefined,
          imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : undefined,
        }))
      : [],
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    vendors: Array.isArray(parsed.vendors)
      ? parsed.vendors.map((v) => ({
          ...v,
          channel: v.channel === "b2b" ? "b2b" : "ecom",
        }))
      : [],
    customers: Array.isArray(parsed.customers)
      ? parsed.customers.map((c) => ({
          ...c,
          channel: c.channel === "b2b" ? "b2b" : "ecom",
        }))
      : [],
    stock: Array.isArray(parsed.stock) ? parsed.stock : [],
    receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
    dispatches: Array.isArray(parsed.dispatches) ? parsed.dispatches : [],
    comboDispatches: Array.isArray(parsed.comboDispatches)
      ? parsed.comboDispatches
      : [],
    adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
    transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
    approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
    combos: Array.isArray(parsed.combos)
      ? parsed.combos.map((c) => ({
          ...c,
          channel: c.channel === "b2b" ? "b2b" : "ecom",
          components: Array.isArray(c.components)
            ? c.components.filter(
                (k) =>
                  k &&
                  typeof k.ean === "string" &&
                  Number.isInteger(k.quantity) &&
                  k.quantity > 0
              )
            : [],
        }))
      : [],
    purchaseOrders: Array.isArray(parsed.purchaseOrders)
      ? parsed.purchaseOrders.map((p) => ({
          ...p,
          channel: p.channel === "b2b" ? "b2b" : "ecom",
        }))
      : [],
    releaseOrders: Array.isArray(parsed.releaseOrders)
      ? parsed.releaseOrders.map((r) => ({
          ...r,
          channel: r.channel === "b2b" ? "b2b" : "ecom",
          // Older ROs predate the approval flow — they were dispatched on create.
          status:
            r.status === "pending" || r.status === "rejected"
              ? r.status
              : "dispatched",
        }))
      : [],
  };
}

/** Read + normalize the JSON file store, or null if the file doesn't exist. */
async function readStoreFromFile(): Promise<Store | null> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return normalizeStore(JSON.parse(raw) as Partial<Store>);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

// When Mongo is configured but unreachable, fall back to the local JSON file
// store so the app keeps working (offline / DNS-SRV-blocked networks) instead of
// hard-crashing every request. We warn at most once per minute to avoid log
// spam, and note that writes made while offline live only in the file until
// Mongo is reachable again.
let lastMongoWarnAt = 0;
function warnMongoFallback(err: unknown): void {
  const now = Date.now();
  if (now - lastMongoWarnAt < 60_000) return;
  lastMongoWarnAt = now;
  const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
  console.warn(
    `[db] MongoDB unavailable, falling back to local file store (data/store.json). Reason: ${msg}`
  );
}

async function readStore(): Promise<Store> {
  if (mongoEnabled()) {
    try {
      const doc = await mongoReadStoreDoc();
      if (doc) return normalizeStore(doc);
      // First run on Mongo: import existing JSON file data (one-time
      // auto-migrate), otherwise start from an empty seeded store.
      const seed = (await readStoreFromFile()) ?? emptyStore();
      await mongoWriteStore(seed);
      return seed;
    } catch (err) {
      warnMongoFallback(err);
      // fall through to the file store below
    }
  }
  return (await readStoreFromFile()) ?? emptyStore();
}

async function writeStore(store: Store): Promise<void> {
  if (mongoEnabled()) {
    try {
      await mongoWriteStore(store);
      return;
    } catch (err) {
      warnMongoFallback(err);
      // fall through to the file store below
    }
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

/** Run a mutation against the store with serialized file access. */
async function mutate<T>(fn: (store: Store) => [Store, T]): Promise<T> {
  const run = writeChain.then(async () => {
    const store = await readStore();
    const [next, result] = fn(store);
    await writeStore(next);
    return result;
  });
  writeChain = run.catch(() => undefined);
  return run;
}

// ---- Combo math -------------------------------------------------------------

function computeCombos(
  quantity: number,
  comboSizes: number[]
): ComboAvailability[] {
  return comboSizes
    .filter((size) => size > 0)
    .sort((a, b) => b - a)
    .map((size) => ({
      size,
      packs: Math.floor(quantity / size),
      leftover: quantity % size,
    }));
}

/** Build the joined stock-line view for a product + its on-hand quantity. */
function buildLine(
  product: Product | undefined,
  ean: string,
  quantity: number
): WarehouseStockLine {
  const comboSizes = product?.comboSizes ?? [];
  const reorderLevel = product?.reorderLevel ?? 0;
  return {
    ean,
    name: product?.name ?? "Unknown product",
    quantity,
    comboSizes,
    combos: computeCombos(quantity, comboSizes),
    barcodes: product?.barcodes ?? [],
    reorderLevel,
    lowStock: quantity <= reorderLevel,
    imageUrl: product?.imageUrl,
  };
}

/** Find a party by case-insensitive name within a channel, creating it if new.
 *  Returns its id (or undefined for a blank name). Mutates the passed list. */
function upsertPartyByName(
  list: Vendor[],
  name: string | undefined,
  channel: Channel
): string | undefined {
  const n = name?.trim();
  if (!n) return undefined;
  const existing = list.find(
    (p) => p.channel === channel && p.name.toLowerCase() === n.toLowerCase()
  );
  if (existing) return existing.id;
  const created: Vendor = {
    id: randomUUID(),
    name: n,
    channel,
    createdAt: new Date().toISOString(),
  };
  list.push(created);
  return created.id;
}

// ---- Channel scoping helpers ------------------------------------------------

/** The channel a warehouse belongs to (defaults to "ecom" if not found). */
function channelOf(store: Store, warehouseId: string): Channel {
  return store.warehouses.find((w) => w.id === warehouseId)?.channel ?? "ecom";
}

/** Ids of all warehouses in a channel. */
function warehouseIdsForChannel(store: Store, channel: Channel): Set<string> {
  return new Set(
    store.warehouses.filter((w) => w.channel === channel).map((w) => w.id)
  );
}

/** A product in a specific channel's catalog, matched by its primary EAN. */
function findProduct(
  store: Store,
  ean: string,
  channel: Channel
): Product | undefined {
  return store.products.find((p) => p.ean === ean && p.channel === channel);
}

/** Resolve a scanned code to a product within one channel — primary EAN first,
 *  then any registered pack barcode. */
function resolveProduct(
  store: Store,
  scanned: string,
  channel: Channel
): Product | undefined {
  return (
    store.products.find((p) => p.channel === channel && p.ean === scanned) ??
    store.products.find(
      (p) => p.channel === channel && p.barcodes.some((b) => b.ean === scanned)
    )
  );
}

// ---- Reads ------------------------------------------------------------------

export async function listWarehouses(
  channel?: Channel
): Promise<WarehouseSummary[]> {
  const store = await readStore();
  return store.warehouses
    .filter((w) => !channel || w.channel === channel)
    .map((w) => {
    const allRows = store.stock.filter((s) => s.warehouseId === w.id);
    const rows = allRows.filter((s) => s.quantity > 0);
    // Low / out of stock: at or below the reorder level. With reorderLevel 0
    // this flags an emptied (quantity 0) line as out of stock.
    const lowStockCount = allRows.filter((r) => {
      const product = findProduct(store, r.ean, w.channel);
      const reorderLevel = product?.reorderLevel ?? 0;
      return r.quantity <= reorderLevel;
    }).length;
    return {
      ...w,
      skuCount: rows.length,
      totalUnits: rows.reduce((sum, r) => sum + r.quantity, 0),
      lowStockCount,
    };
  });
}

export async function getWarehouseDetail(
  id: string
): Promise<WarehouseDetail | undefined> {
  const store = await readStore();
  const warehouse = store.warehouses.find((w) => w.id === id);
  if (!warehouse) return undefined;

  const lines: WarehouseStockLine[] = store.stock
    .filter((s) => s.warehouseId === id)
    .map((s) =>
      buildLine(findProduct(store, s.ean, warehouse.channel), s.ean, s.quantity)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...warehouse,
    lines,
    totalUnits: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
}

/** Unified, newest-first movement log (stock-in + stock-out) for a warehouse. */
export async function getWarehouseMovements(
  id: string
): Promise<Movement[] | undefined> {
  const store = await readStore();
  const warehouse = store.warehouses.find((w) => w.id === id);
  if (!warehouse) return undefined;

  const nameFor = (ean: string) =>
    findProduct(store, ean, warehouse.channel)?.name ?? "Unknown product";

  const ins: Movement[] = store.receipts
    .filter((r) => r.warehouseId === id)
    .map((r) => ({
      id: r.id,
      type: "in",
      ean: r.ean,
      name: nameFor(r.ean),
      quantity: r.quantity,
      date: r.date,
      bill: r.bill,
      vendorName: r.vendorName,
      byName: r.byName,
      createdAt: r.createdAt,
    }));

  const outs: Movement[] = store.dispatches
    .filter((d) => d.warehouseId === id)
    .map((d) => ({
      id: d.id,
      type: "out",
      ean: d.ean,
      name: nameFor(d.ean),
      quantity: d.quantity,
      unitSize: d.unitSize,
      packs: d.packs,
      date: d.date,
      invoiceNo: d.invoiceNo,
      referenceNo: d.referenceNo,
      customerName: d.customerName,
      byName: d.byName,
      createdAt: d.createdAt,
    }));

  const adjusts: Movement[] = store.adjustments
    .filter((a) => a.warehouseId === id)
    .map((a) => ({
      id: a.id,
      type: "adjust",
      ean: a.ean,
      name: nameFor(a.ean),
      quantity: a.delta, // signed
      reason: a.reason,
      note: a.note,
      byName: a.byName,
      createdAt: a.createdAt,
    }));

  const nameForWh = (whId: string) =>
    store.warehouses.find((w) => w.id === whId)?.name ?? whId;

  const transfers: Movement[] = store.transfers
    .filter((t) => t.fromWarehouseId === id || t.toWarehouseId === id)
    .map((t) => {
      const outgoing = t.fromWarehouseId === id;
      return {
        id: t.id,
        type: outgoing ? "transfer-out" : "transfer-in",
        ean: t.ean,
        name: nameFor(t.ean),
        quantity: t.quantity,
        note: t.note,
        byName: t.byName,
        counterparty: nameForWh(
          outgoing ? t.toWarehouseId : t.fromWarehouseId
        ),
        createdAt: t.createdAt,
      };
    });

  const comboOuts: Movement[] = store.comboDispatches
    .filter((c) => c.warehouseId === id)
    .map((c) => ({
      id: c.id,
      type: "combo-out",
      ean: c.barcode ?? "",
      name: c.comboName,
      quantity: c.totalPieces,
      packs: c.combos,
      date: c.date,
      invoiceNo: c.invoiceNo,
      referenceNo: c.referenceNo,
      customerName: c.customerName,
      comboItems: c.components
        .map((k) => `${k.name} ×${k.pieces}`)
        .join(", "),
      byName: c.byName,
      createdAt: c.createdAt,
    }));

  return [...ins, ...outs, ...adjusts, ...transfers, ...comboOuts].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/** All distinct products in a channel with stock totalled across that channel's
 *  warehouses. */
export async function listCatalog(
  channel: Channel = "ecom"
): Promise<ProductCatalogEntry[]> {
  const store = await readStore();
  const warehouses = store.warehouses.filter((w) => w.channel === channel);
  return store.products
    .filter((p) => p.channel === channel)
    .map((p) => {
      const byWarehouse = warehouses.map((w) => ({
        warehouseId: w.id,
        warehouseName: w.name,
        quantity:
          store.stock.find((s) => s.warehouseId === w.id && s.ean === p.ean)
            ?.quantity ?? 0,
      }));
      const totalQuantity = byWarehouse.reduce((sum, b) => sum + b.quantity, 0);
      return {
        ean: p.ean,
        name: p.name,
        brand: p.brand,
        comboSizes: p.comboSizes,
        barcodes: p.barcodes,
        reorderLevel: p.reorderLevel,
        sellingPrice: p.sellingPrice,
        purchasePrice: p.purchasePrice,
        totalQuantity,
        lowStock: totalQuantity <= p.reorderLevel,
        byWarehouse,
        imageUrl: p.imageUrl,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Purchase (stock-in) history for one product in a channel, resolved from a
 *  scanned code (primary EAN / 12NC, or any pack barcode / ASIN). Returns null
 *  if the code matches no product in this channel. */
export async function getProductPurchaseHistory(
  code: string,
  channel: Channel = "ecom"
): Promise<ProductPurchaseHistory | null> {
  const store = await readStore();
  const scanned = code.trim();
  if (!scanned) return null;
  const product = resolveProduct(store, scanned, channel);
  if (!product) return null;

  const whIds = warehouseIdsForChannel(store, channel);
  const whName = (id: string) =>
    store.warehouses.find((w) => w.id === id)?.name ?? id;

  const entries = store.receipts
    .filter((r) => whIds.has(r.warehouseId) && r.ean === product.ean)
    .map((r) => ({
      date: r.date || r.createdAt.slice(0, 10),
      warehouseName: whName(r.warehouseId),
      quantity: r.quantity,
      price: r.purchasePrice,
      amount:
        typeof r.purchasePrice === "number"
          ? r.purchasePrice * r.quantity
          : undefined,
      vendorName: r.vendorName,
      bill: r.bill,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Current stock in each warehouse of the channel, kept in warehouse order.
  const stockByWarehouse = store.warehouses
    .filter((w) => w.channel === channel)
    .map((w) => ({
      warehouseId: w.id,
      warehouseName: w.name,
      quantity:
        store.stock.find((s) => s.warehouseId === w.id && s.ean === product.ean)
          ?.quantity ?? 0,
    }));
  const currentStockTotal = stockByWarehouse.reduce((s, c) => s + c.quantity, 0);

  // Latest recorded purchase rate (entries are already newest-first).
  const latestRate = entries.find((e) => typeof e.price === "number")?.price;

  return {
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    totalQuantity: entries.reduce((s, e) => s + e.quantity, 0),
    totalValue: entries.reduce((s, e) => s + (e.amount ?? 0), 0),
    entries,
    stockByWarehouse,
    currentStockTotal,
    latestRate,
  };
}

// ---- Writes -----------------------------------------------------------------

/** Receive a batch of goods into a warehouse. The scanned EAN may be a
 *  product's primary EAN or any of its pack barcodes — it is resolved to the
 *  product. Creates the product only if the EAN matches nothing. */
export async function receiveStock(
  warehouseId: string,
  input: ReceiveInput,
  by?: { id: string; name: string }
): Promise<WarehouseStockLine> {
  return mutate((store) => {
    const warehouse = store.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");
    const channel = warehouse.channel;

    const scanned = input.ean.trim();

    // Resolve to an existing product in this channel — primary EAN, then pack
    // barcode.
    let product = resolveProduct(store, scanned, channel);

    if (!product) {
      product = {
        ean: scanned,
        channel,
        name: input.name?.trim() || `Product ${scanned}`,
        comboSizes: input.comboSizes ?? [],
        barcodes: [],
        reorderLevel: input.reorderLevel ?? 0,
      };
      store.products.push(product);
    } else {
      if (input.name?.trim()) product.name = input.name.trim();
      if (input.comboSizes) product.comboSizes = input.comboSizes;
      if (typeof input.reorderLevel === "number") {
        product.reorderLevel = input.reorderLevel;
      }
    }

    // Stock is always keyed by the product's primary EAN.
    const stockEan = product.ean;

    // Remember the latest purchase (cost) price on the product for valuation.
    if (typeof input.purchasePrice === "number") {
      product.purchasePrice = input.purchasePrice;
    }

    // Add to (or create) the per-warehouse stock row.
    let row = store.stock.find(
      (s) => s.warehouseId === warehouseId && s.ean === stockEan
    );
    if (!row) {
      row = { warehouseId, ean: stockEan, quantity: 0 };
      store.stock.push(row);
    }
    row.quantity += input.quantity;

    const vendorId = upsertPartyByName(store.vendors, input.vendorName, channel);

    store.receipts.push({
      id: randomUUID(),
      warehouseId,
      ean: stockEan,
      quantity: input.quantity,
      bill: input.bill,
      vendorName: input.vendorName?.trim() || undefined,
      vendorId,
      date: input.date,
      purchasePrice: input.purchasePrice,
      byId: by?.id,
      byName: by?.name,
      createdAt: new Date().toISOString(),
    });

    return [store, buildLine(product, stockEan, row.quantity)];
  });
}

/** Receive several products into a warehouse in one go (bulk stock-in). Shares
 *  bill / vendor / date across all lines. All-or-nothing on validation: every
 *  line's code must already resolve to a product in this channel (add brand-new
 *  products via Add Product), and quantities must be positive. */
export async function receiveStockBulk(
  warehouseId: string,
  input: BulkReceiveInput,
  by?: { id: string; name: string }
): Promise<BulkReceiveResult> {
  return mutate((store) => {
    const warehouse = store.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");
    const channel = warehouse.channel;
    if (!input.lines.length) throw new Error("Add at least one line to receive.");

    const resolved = input.lines.map((ln) => ({
      scanned: ln.ean.trim(),
      product: resolveProduct(store, ln.ean.trim(), channel),
      name: ln.name?.trim(),
      quantity: Math.floor(Number(ln.quantity) || 0),
      purchasePrice:
        typeof ln.purchasePrice === "number" ? ln.purchasePrice : undefined,
    }));

    const errors: string[] = [];
    for (const r of resolved) {
      if (!r.scanned) errors.push("A line is missing its code");
      else if (!r.product && !r.name) {
        errors.push(`"${r.scanned}" is new — enter a name to create it`);
      }
      if (r.quantity <= 0) {
        errors.push(`"${r.product?.name ?? r.scanned}" — quantity must be greater than 0`);
      }
    }
    if (errors.length) throw new Error(errors.join("; ") + ".");

    const vendorId = upsertPartyByName(store.vendors, input.vendorName, channel);
    const now = new Date().toISOString();
    let totalPieces = 0;

    for (const r of resolved) {
      // Existing product, or create a new one from the entered name.
      let product = r.product;
      if (!product) {
        product = {
          ean: r.scanned,
          channel,
          name: r.name || `Product ${r.scanned}`,
          comboSizes: [],
          barcodes: [],
          reorderLevel: 0,
        };
        store.products.push(product);
      }
      const stockEan = product.ean;
      if (typeof r.purchasePrice === "number") {
        product.purchasePrice = r.purchasePrice;
      }
      let row = store.stock.find(
        (s) => s.warehouseId === warehouseId && s.ean === stockEan
      );
      if (!row) {
        row = { warehouseId, ean: stockEan, quantity: 0 };
        store.stock.push(row);
      }
      row.quantity += r.quantity;
      totalPieces += r.quantity;

      store.receipts.push({
        id: randomUUID(),
        warehouseId,
        ean: stockEan,
        quantity: r.quantity,
        bill: input.bill,
        vendorName: input.vendorName?.trim() || undefined,
        vendorId,
        date: input.date,
        purchasePrice: r.purchasePrice,
        byId: by?.id,
        byName: by?.name,
        createdAt: now,
      });
    }

    return [store, { received: resolved.length, totalPieces }];
  });
}

/** Dispatch goods out of a warehouse as packs (stock-out). The scanned `ean`
 *  may be the product's primary EAN or any of its pack barcodes; it is resolved
 *  to the product, then `unitSize * packs` pieces are removed from that
 *  product's stock. Throws if stock is insufficient. */
export async function dispatchStock(
  warehouseId: string,
  input: DispatchInput,
  by?: { id: string; name: string }
): Promise<WarehouseStockLine> {
  return mutate((store) => {
    const warehouse = store.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");
    const channel = warehouse.channel;

    const scanned = input.ean.trim();
    // Resolve the scanned barcode to its product within this channel.
    const product = resolveProduct(store, scanned, channel);
    // Stock is always keyed by the product's primary EAN.
    const stockEan = product?.ean ?? scanned;

    const row = store.stock.find(
      (s) => s.warehouseId === warehouseId && s.ean === stockEan
    );
    if (!row) throw new Error("This product is not stocked in this warehouse.");

    const pieces = input.unitSize * input.packs;
    if (pieces > row.quantity) {
      throw new Error(
        `Not enough stock. ${pieces} pieces requested but only ${row.quantity} available.`
      );
    }
    row.quantity -= pieces;

    const customerId = upsertPartyByName(
      store.customers,
      input.customerName,
      channel
    );

    store.dispatches.push({
      id: randomUUID(),
      warehouseId,
      ean: stockEan,
      unitSize: input.unitSize,
      packs: input.packs,
      quantity: pieces,
      date: input.date,
      invoiceNo: input.invoiceNo,
      referenceNo: input.referenceNo,
      customerName: input.customerName?.trim() || undefined,
      customerId,
      byId: by?.id,
      byName: by?.name,
      createdAt: new Date().toISOString(),
    });

    return [store, buildLine(product, stockEan, row.quantity)];
  });
}

/** Dispatch several products out of a warehouse in one go (bulk stock-out).
 *  All-or-nothing: if any line is short on stock, nothing is dispatched and an
 *  error listing the shortfalls is thrown. Lines hitting the same product are
 *  validated against the combined quantity. */
export async function dispatchStockBulk(
  warehouseId: string,
  input: BulkDispatchInput,
  by?: { id: string; name: string }
): Promise<BulkDispatchResult> {
  return mutate((store) => {
    const warehouse = store.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");
    const channel = warehouse.channel;
    if (!input.lines.length) throw new Error("Add at least one line to dispatch.");

    // Resolve each line to a product + its stock-keyed EAN and piece count.
    const resolved = input.lines.map((ln) => {
      const scanned = ln.ean.trim();
      const product = resolveProduct(store, scanned, channel);
      return {
        product,
        stockEan: product?.ean ?? scanned,
        unitSize: ln.unitSize,
        packs: ln.packs,
        pieces: ln.unitSize * ln.packs,
      };
    });

    // Validate the combined requirement per product against available stock.
    const need = new Map<string, number>();
    for (const r of resolved) need.set(r.stockEan, (need.get(r.stockEan) ?? 0) + r.pieces);
    const errors: string[] = [];
    for (const [stockEan, total] of need) {
      const have =
        store.stock.find((s) => s.warehouseId === warehouseId && s.ean === stockEan)
          ?.quantity ?? 0;
      if (total > have) {
        const name = findProduct(store, stockEan, channel)?.name ?? stockEan;
        errors.push(`"${name}" — need ${total}, only ${have} available`);
      }
    }
    if (errors.length) {
      throw new Error("Not enough stock. " + errors.join("; ") + ".");
    }

    // Deduct + log a dispatch per line (shared date / invoice / customer).
    const customerId = upsertPartyByName(
      store.customers,
      input.customerName,
      channel
    );
    const now = new Date().toISOString();
    let totalPieces = 0;
    for (const r of resolved) {
      const row = store.stock.find(
        (s) => s.warehouseId === warehouseId && s.ean === r.stockEan
      )!;
      row.quantity -= r.pieces;
      totalPieces += r.pieces;
      store.dispatches.push({
        id: randomUUID(),
        warehouseId,
        ean: r.stockEan,
        unitSize: r.unitSize,
        packs: r.packs,
        quantity: r.pieces,
        date: input.date,
        invoiceNo: input.invoiceNo,
        referenceNo: input.referenceNo,
        customerName: input.customerName?.trim() || undefined,
        customerId,
        byId: by?.id,
        byName: by?.name,
        createdAt: now,
      });
    }
    return [store, { dispatched: resolved.length, totalPieces }];
  });
}

/** Bulk-import master products with their pack barcodes. Creates new products,
 *  merges packs into existing ones (updating size/name/price on matching EANs).
 *  Pack EANs that collide with another product's primary EAN are skipped. */
export async function importCatalog(
  items: ImportItem[],
  channel: Channel = "ecom",
  defaultBrand?: string
): Promise<ImportResult> {
  return mutate<ImportResult>((store) => {
    let productsCreated = 0;
    let productsUpdated = 0;
    let packsAdded = 0;

    for (const item of items) {
      const ean = item.ean.trim();
      if (!ean) continue;
      const brand = item.brand?.trim() || defaultBrand?.trim() || undefined;

      let product = findProduct(store, ean, channel);
      if (!product) {
        product = {
          ean,
          channel,
          name: item.name.trim() || `Product ${ean}`,
          brand,
          comboSizes: [],
          barcodes: [],
          reorderLevel: 0,
        };
        store.products.push(product);
        productsCreated++;
      } else {
        if (item.name.trim()) product.name = item.name.trim();
        if (brand) product.brand = brand;
        productsUpdated++;
      }

      // Merge any pack sizes parsed from barcode-less pack rows (P10/P15/…).
      if (item.comboSizes && item.comboSizes.length) {
        const merged = new Set<number>([
          ...product.comboSizes,
          ...item.comboSizes.filter((s) => Number.isInteger(s) && s > 1),
        ]);
        product.comboSizes = [...merged].sort((a, b) => a - b);
      }

      // EANs owned by OTHER products in this channel (can't reuse as a pack
      // barcode here).
      const otherPrimary = new Set(
        store.products
          .filter((p) => p.channel === channel && p.ean !== product!.ean)
          .map((p) => p.ean)
      );

      for (const b of normalizeBarcodes(item.barcodes)) {
        if (b.ean === product.ean || otherPrimary.has(b.ean)) continue;
        const existing = product.barcodes.find((x) => x.ean === b.ean);
        if (existing) {
          existing.size = b.size;
          existing.name = b.name;
          existing.price = b.price;
        } else {
          product.barcodes.push(b);
          packsAdded++;
        }
      }
    }

    return [store, { productsCreated, productsUpdated, packsAdded }];
  });
}

/** Update a product's name, combo (pack) sizes, pack barcodes, and/or reorder
 *  level. */
export async function updateProduct(
  ean: string,
  input: ProductUpdateInput,
  channel: Channel = "ecom"
): Promise<boolean> {
  return mutate((store) => {
    const product = findProduct(store, ean, channel);
    if (!product) return [store, false];
    if (typeof input.name === "string" && input.name.trim()) {
      product.name = input.name.trim();
    }
    if (input.comboSizes) {
      product.comboSizes = input.comboSizes.filter((s) => s > 0);
    }
    if (input.barcodes) {
      // Keep clean rows only, and never let a pack barcode collide with another
      // product's primary EAN or barcode.
      const taken = new Set<string>();
      for (const p of store.products) {
        if (p.channel !== channel || p.ean === product.ean) continue;
        taken.add(p.ean);
        p.barcodes.forEach((b) => taken.add(b.ean));
      }
      product.barcodes = normalizeBarcodes(input.barcodes).filter(
        (b) => b.ean !== product.ean && !taken.has(b.ean)
      );
    }
    if (typeof input.reorderLevel === "number") {
      product.reorderLevel = Math.max(0, Math.floor(input.reorderLevel));
    }
    if (typeof input.sellingPrice === "number") {
      product.sellingPrice = Math.max(0, input.sellingPrice);
    }
    if (typeof input.purchasePrice === "number") {
      product.purchasePrice = Math.max(0, input.purchasePrice);
    }
    if (typeof input.imageUrl === "string") {
      // Empty string clears the image.
      product.imageUrl = input.imageUrl.trim() || undefined;
    }
    return [store, true];
  });
}

/** Remove a product's stock line from one warehouse (does not delete the
 *  shared product record, which may still be stocked elsewhere). */
export async function removeStockLine(
  warehouseId: string,
  ean: string
): Promise<boolean> {
  return mutate((store) => {
    const before = store.stock.length;
    store.stock = store.stock.filter(
      (s) => !(s.warehouseId === warehouseId && s.ean === ean)
    );
    return [store, store.stock.length !== before];
  });
}

/** Delete products by EAN: removes the product record and its per-warehouse
 *  stock rows everywhere, and strips the EANs from any combo recipes so they
 *  don't dangle. Historical receipts/dispatches are kept as an audit trail.
 *  Returns the number of products actually removed. */
export async function deleteProducts(
  eans: string[],
  channel: Channel = "ecom"
): Promise<number> {
  const set = new Set(eans.map((e) => e.trim()).filter(Boolean));
  if (set.size === 0) return 0;
  return mutate((store) => {
    // Only delete products in this channel; collect their stock rows by the
    // channel's warehouse ids so the other channel's identical EANs are kept.
    const whIds = warehouseIdsForChannel(store, channel);
    const before = store.products.length;
    store.products = store.products.filter(
      (p) => !(p.channel === channel && set.has(p.ean))
    );
    const removed = before - store.products.length;
    if (removed > 0) {
      store.stock = store.stock.filter(
        (s) => !(whIds.has(s.warehouseId) && set.has(s.ean))
      );
      for (const c of store.combos) {
        if (c.channel !== channel) continue;
        c.components = c.components.filter((k) => !set.has(k.ean));
      }
    }
    return [store, removed];
  });
}

// ---- Stock adjustments & transfers ------------------------------------------

/** Apply a manual +/- correction to a stock line. Throws if it would push the
 *  quantity below zero. */
export async function adjustStock(
  warehouseId: string,
  ean: string,
  delta: number,
  reason: string,
  note: string | undefined,
  by?: { id: string; name: string }
): Promise<WarehouseStockLine> {
  return mutate((store) => {
    const warehouse = store.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");

    const row = store.stock.find(
      (s) => s.warehouseId === warehouseId && s.ean === ean
    );
    if (!row) throw new Error("This product is not stocked in this warehouse.");

    const newQty = row.quantity + delta;
    if (newQty < 0) {
      throw new Error(
        `Adjustment would make stock negative (currently ${row.quantity}).`
      );
    }
    row.quantity = newQty;

    store.adjustments.push({
      id: randomUUID(),
      warehouseId,
      ean,
      delta,
      reason,
      note,
      byId: by?.id,
      byName: by?.name,
      createdAt: new Date().toISOString(),
    });

    const product = findProduct(store, ean, warehouse.channel);
    return [store, buildLine(product, ean, row.quantity)];
  });
}

/** Move pieces of a product from one warehouse to another. Throws if the
 *  source lacks enough stock. */
export async function transferStock(
  fromWarehouseId: string,
  toWarehouseId: string,
  ean: string,
  quantity: number,
  note: string | undefined,
  by?: { id: string; name: string }
): Promise<{ from: WarehouseStockLine; to: WarehouseStockLine }> {
  return mutate((store) => {
    if (fromWarehouseId === toWarehouseId) {
      throw new Error("Source and destination warehouses must differ.");
    }
    const from = store.warehouses.find((w) => w.id === fromWarehouseId);
    const to = store.warehouses.find((w) => w.id === toWarehouseId);
    if (!from || !to) throw new Error("Warehouse not found.");
    if (from.channel !== to.channel) {
      throw new Error("Can't transfer stock between different channels.");
    }

    const fromRow = store.stock.find(
      (s) => s.warehouseId === fromWarehouseId && s.ean === ean
    );
    if (!fromRow || fromRow.quantity < quantity) {
      throw new Error(
        `Not enough stock to transfer. ${quantity} requested but only ${
          fromRow?.quantity ?? 0
        } available.`
      );
    }
    fromRow.quantity -= quantity;

    let toRow = store.stock.find(
      (s) => s.warehouseId === toWarehouseId && s.ean === ean
    );
    if (!toRow) {
      toRow = { warehouseId: toWarehouseId, ean, quantity: 0 };
      store.stock.push(toRow);
    }
    toRow.quantity += quantity;

    store.transfers.push({
      id: randomUUID(),
      fromWarehouseId,
      toWarehouseId,
      ean,
      quantity,
      note,
      byId: by?.id,
      byName: by?.name,
      createdAt: new Date().toISOString(),
    });

    const product = findProduct(store, ean, from.channel);
    return [
      store,
      {
        from: buildLine(product, ean, fromRow.quantity),
        to: buildLine(product, ean, toRow.quantity),
      },
    ];
  });
}

// ---- Admin: valuation -------------------------------------------------------

/** Inventory valuation for the admin panel: per-product product value
 *  (stock × selling price) and purchase value (stock × purchase price), plus
 *  grand totals. */
export async function getValuation(
  channel: Channel = "ecom"
): Promise<InventoryValuation> {
  const store = await readStore();
  const whIds = warehouseIdsForChannel(store, channel);
  const products: ProductValue[] = store.products
    .filter((p) => p.channel === channel)
    .map((p) => {
      const quantity = store.stock
        .filter((s) => whIds.has(s.warehouseId) && s.ean === p.ean)
        .reduce((sum, s) => sum + s.quantity, 0);
      const sellingPrice = p.sellingPrice ?? 0;
      const purchasePrice = p.purchasePrice ?? 0;
      return {
        ean: p.ean,
        name: p.name,
        quantity,
        sellingPrice,
        purchasePrice,
        productValue: quantity * sellingPrice,
        purchaseValue: quantity * purchasePrice,
      };
    })
    .sort((a, b) => b.productValue - a.productValue);

  return {
    products,
    totalQuantity: products.reduce((s, p) => s + p.quantity, 0),
    totalProductValue: products.reduce((s, p) => s + p.productValue, 0),
    totalPurchaseValue: products.reduce((s, p) => s + p.purchaseValue, 0),
  };
}

// ---- Admin: reports ---------------------------------------------------------

/** Business report over an optional [from, to] date range (inclusive,
 *  YYYY-MM-DD). Sales revenue/profit use current product prices; purchase spend
 *  uses each receipt's recorded cost. */
export async function getReports(
  from?: string,
  to?: string,
  channel: Channel = "ecom"
): Promise<Report> {
  const store = await readStore();
  const whIds = warehouseIdsForChannel(store, channel);
  const product = (ean: string) => findProduct(store, ean, channel);
  const dayOf = (date: string | undefined, createdAt: string) =>
    date || createdAt.slice(0, 10);
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);

  // Per-product aggregation.
  const rows = new Map<string, ReportProductRow>();
  const rowFor = (ean: string): ReportProductRow => {
    let r = rows.get(ean);
    if (!r) {
      r = {
        ean,
        name: product(ean)?.name ?? "Unknown product",
        soldUnits: 0,
        revenue: 0,
        purchasedUnits: 0,
        spend: 0,
        profit: 0,
      };
      rows.set(ean, r);
    }
    return r;
  };

  // Monthly buckets.
  const months = new Map<string, ReportMonthly>();
  const monthFor = (day: string): ReportMonthly => {
    const m = day.slice(0, 7);
    let bucket = months.get(m);
    if (!bucket) {
      bucket = { month: m, salesRevenue: 0, purchaseSpend: 0, salesUnits: 0 };
      months.set(m, bucket);
    }
    return bucket;
  };

  let salesUnits = 0;
  let revenue = 0;
  let cogs = 0;
  let salesCount = 0;
  for (const d of store.dispatches) {
    if (!whIds.has(d.warehouseId)) continue;
    const day = dayOf(d.date, d.createdAt);
    if (!inRange(day)) continue;
    const p = product(d.ean);
    const lineRevenue = d.quantity * (p?.sellingPrice ?? 0);
    const lineCogs = d.quantity * (p?.purchasePrice ?? 0);
    salesUnits += d.quantity;
    revenue += lineRevenue;
    cogs += lineCogs;
    salesCount += 1;
    const r = rowFor(d.ean);
    r.soldUnits += d.quantity;
    r.revenue += lineRevenue;
    r.profit += lineRevenue - lineCogs;
    const mb = monthFor(day);
    mb.salesRevenue += lineRevenue;
    mb.salesUnits += d.quantity;
  }

  let purchaseUnits = 0;
  let spend = 0;
  let purchaseCount = 0;
  for (const rc of store.receipts) {
    if (!whIds.has(rc.warehouseId)) continue;
    const day = dayOf(rc.date, rc.createdAt);
    if (!inRange(day)) continue;
    const lineSpend = rc.quantity * (rc.purchasePrice ?? 0);
    purchaseUnits += rc.quantity;
    spend += lineSpend;
    purchaseCount += 1;
    const r = rowFor(rc.ean);
    r.purchasedUnits += rc.quantity;
    r.spend += lineSpend;
    monthFor(day).purchaseSpend += lineSpend;
  }

  const profit = revenue - cogs;

  // Low stock across this channel's warehouses.
  const lowStock: LowStockRow[] = store.stock
    .filter((s) => whIds.has(s.warehouseId))
    .map((s) => {
      const p = product(s.ean);
      const reorderLevel = p?.reorderLevel ?? 0;
      return {
        ean: s.ean,
        name: p?.name ?? "Unknown product",
        warehouseName:
          store.warehouses.find((w) => w.id === s.warehouseId)?.name ??
          s.warehouseId,
        quantity: s.quantity,
        reorderLevel,
      };
    })
    .filter((r) => r.quantity <= r.reorderLevel)
    .sort((a, b) => a.quantity - b.quantity);

  const valuation = await getValuation(channel);

  return {
    from,
    to,
    sales: {
      units: salesUnits,
      revenue,
      cogs,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      count: salesCount,
    },
    purchases: { units: purchaseUnits, spend, count: purchaseCount },
    inventory: {
      totalQuantity: valuation.totalQuantity,
      totalProductValue: valuation.totalProductValue,
      totalPurchaseValue: valuation.totalPurchaseValue,
    },
    byProduct: [...rows.values()].sort((a, b) => b.revenue - a.revenue),
    monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    lowStock,
  };
}

// ---- Stock aging (slow-moving / stuck stock) --------------------------------

/** Products still in stock that haven't moved out for `days`+ days (or were
 *  never sold since received) — likely damaged, dead, or stuck stock. Uses
 *  existing receipts/dispatches only; nothing needs to be recorded manually. */
export async function getStockAging(
  channel: Channel = "ecom",
  days = 30
): Promise<StockAgingRow[]> {
  const store = await readStore();
  const whIds = warehouseIdsForChannel(store, channel);
  const whName = (wid: string) =>
    store.warehouses.find((w) => w.id === wid)?.name ?? wid;
  const dayOf = (date: string | undefined, createdAt: string) =>
    date || createdAt.slice(0, 10);
  const todayMs = Date.now();

  // In-stock quantity + holding warehouses, per product (this channel).
  const stockByEan = new Map<string, { qty: number; whs: Set<string> }>();
  for (const s of store.stock) {
    if (!whIds.has(s.warehouseId) || s.quantity <= 0) continue;
    const e = stockByEan.get(s.ean) ?? { qty: 0, whs: new Set<string>() };
    e.qty += s.quantity;
    e.whs.add(whName(s.warehouseId));
    stockByEan.set(s.ean, e);
  }

  // Last stock-out date per product (plain dispatches + combo components).
  const lastOut = new Map<string, string>();
  const noteOut = (ean: string, day: string) => {
    const cur = lastOut.get(ean);
    if (!cur || day > cur) lastOut.set(ean, day);
  };
  for (const d of store.dispatches) {
    if (whIds.has(d.warehouseId)) noteOut(d.ean, dayOf(d.date, d.createdAt));
  }
  for (const c of store.comboDispatches) {
    if (!whIds.has(c.warehouseId)) continue;
    const day = dayOf(c.date, c.createdAt);
    for (const comp of c.components) noteOut(comp.ean, day);
  }

  // Earliest receipt date per product (fallback age when never sold).
  const firstIn = new Map<string, string>();
  for (const r of store.receipts) {
    if (!whIds.has(r.warehouseId)) continue;
    const day = dayOf(r.date, r.createdAt);
    const cur = firstIn.get(r.ean);
    if (!cur || day < cur) firstIn.set(r.ean, day);
  }

  const rows: StockAgingRow[] = [];
  for (const [ean, info] of stockByEan) {
    const out = lastOut.get(ean);
    const baseDay = out ?? firstIn.get(ean);
    if (!baseDay) continue; // no dates to judge age
    const idleDays = Math.max(
      0,
      Math.floor((todayMs - new Date(baseDay).getTime()) / 86_400_000)
    );
    if (idleDays < days) continue;
    const product = findProduct(store, ean, channel);
    const price = product?.sellingPrice ?? product?.purchasePrice ?? 0;
    rows.push({
      ean,
      name: product?.name ?? "Unknown product",
      quantity: info.qty,
      lastOutDate: out,
      neverSold: !out,
      idleDays,
      value: info.qty * price,
      warehouses: [...info.whs].sort(),
    });
  }
  rows.sort((a, b) => b.idleDays - a.idleDays);
  return rows;
}

// ---- Admin: approvals (stock-in & stock adjustments) ------------------------

/** Queue a regular user's stock-in for admin approval (stock is not changed
 *  until approved). */
export async function createApproval(
  warehouseId: string,
  payload: ReceiveInput,
  requestedBy?: { id: string; name: string }
): Promise<Approval> {
  return mutate((store) => {
    const approval: Approval = {
      id: randomUUID(),
      type: "receive",
      warehouseId,
      payload,
      status: "pending",
      requestedBy: requestedBy?.id,
      requestedByName: requestedBy?.name,
      createdAt: new Date().toISOString(),
    };
    store.approvals.push(approval);
    return [store, approval];
  });
}

/** Queue a regular user's stock adjustment for admin approval (stock is not
 *  changed until approved). */
export async function createAdjustApproval(
  warehouseId: string,
  adjustPayload: AdjustPayload,
  requestedBy?: { id: string; name: string }
): Promise<Approval> {
  return mutate((store) => {
    const approval: Approval = {
      id: randomUUID(),
      type: "adjust",
      warehouseId,
      adjustPayload,
      status: "pending",
      requestedBy: requestedBy?.id,
      requestedByName: requestedBy?.name,
      createdAt: new Date().toISOString(),
    };
    store.approvals.push(approval);
    return [store, approval];
  });
}

/** All approvals for a channel (by their warehouse), newest first. */
export async function listApprovals(
  channel: Channel = "ecom"
): Promise<Approval[]> {
  const store = await readStore();
  const whIds = warehouseIdsForChannel(store, channel);
  return store.approvals
    .filter((a) => whIds.has(a.warehouseId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Approve or reject a pending stock-in. Approving applies the receive.
 *  Returns the updated approval, or null if not found / already decided. */
export async function decideApproval(
  id: string,
  action: "approve" | "reject",
  decidedBy?: { id: string; name: string }
): Promise<Approval | null> {
  // Read first to validate; apply the receive (which has its own mutate) before
  // marking the approval decided, so stock and status move together.
  const approval = (await readStore()).approvals.find((a) => a.id === id);
  if (!approval || approval.status !== "pending") return null;

  // Apply the change (each has its own mutate) before marking decided, so stock
  // and status move together. If the apply throws (e.g. stock would go
  // negative), it propagates and the approval stays pending.
  if (action === "approve") {
    const by = approval.requestedBy
      ? { id: approval.requestedBy, name: approval.requestedByName ?? "" }
      : undefined;
    if (approval.type === "adjust" && approval.adjustPayload) {
      const ap = approval.adjustPayload;
      await adjustStock(approval.warehouseId, ap.ean, ap.delta, ap.reason, ap.note, by);
    } else if (approval.payload) {
      await receiveStock(approval.warehouseId, approval.payload, by);
    }
  }

  return mutate((store) => {
    const target = store.approvals.find((a) => a.id === id);
    if (!target || target.status !== "pending") return [store, null];
    target.status = action === "approve" ? "approved" : "rejected";
    target.decidedBy = decidedBy?.id;
    target.decidedByName = decidedBy?.name;
    target.decidedAt = new Date().toISOString();
    return [store, target];
  });
}

// ---- Parties: vendors & customers ------------------------------------------

type PartyResult = { ok: true; party: Vendor } | { ok: false; error: string };

function cleanPartyInput(input: PartyInput) {
  const trim = (s?: string) =>
    typeof s === "string" ? s.trim() || undefined : undefined;
  return {
    name: trim(input.name),
    phone: trim(input.phone),
    gstin: trim(input.gstin),
    address: trim(input.address),
    note: trim(input.note),
  };
}

export async function listVendors(channel: Channel = "ecom"): Promise<Vendor[]> {
  const store = await readStore();
  return store.vendors
    .filter((v) => v.channel === channel)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCustomers(
  channel: Channel = "ecom"
): Promise<Customer[]> {
  const store = await readStore();
  return store.customers
    .filter((c) => c.channel === channel)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function createPartyIn(
  list: Vendor[],
  input: PartyInput,
  channel: Channel
): PartyResult {
  const c = cleanPartyInput(input);
  if (!c.name) return { ok: false, error: "Name is required." };
  if (
    list.some(
      (p) => p.channel === channel && p.name.toLowerCase() === c.name!.toLowerCase()
    )
  ) {
    return { ok: false, error: "A record with this name already exists." };
  }
  const party: Vendor = {
    id: randomUUID(),
    name: c.name,
    phone: c.phone,
    gstin: c.gstin,
    address: c.address,
    note: c.note,
    channel,
    createdAt: new Date().toISOString(),
  };
  list.push(party);
  return { ok: true, party };
}

function updatePartyIn(list: Vendor[], id: string, input: PartyInput): PartyResult {
  const party = list.find((p) => p.id === id);
  if (!party) return { ok: false, error: "Not found." };
  const c = cleanPartyInput(input);
  if (input.name !== undefined) {
    if (!c.name) return { ok: false, error: "Name can't be empty." };
    if (
      list.some(
        (p) =>
          p.id !== id &&
          p.channel === party.channel &&
          p.name.toLowerCase() === c.name!.toLowerCase()
      )
    ) {
      return { ok: false, error: "A record with this name already exists." };
    }
    party.name = c.name;
  }
  if (input.phone !== undefined) party.phone = c.phone;
  if (input.gstin !== undefined) party.gstin = c.gstin;
  if (input.address !== undefined) party.address = c.address;
  if (input.note !== undefined) party.note = c.note;
  return { ok: true, party };
}

export async function createVendor(
  input: PartyInput,
  channel: Channel = "ecom"
): Promise<PartyResult> {
  return mutate<PartyResult>((s) => [s, createPartyIn(s.vendors, input, channel)]);
}
export async function updateVendor(id: string, input: PartyInput): Promise<PartyResult> {
  return mutate<PartyResult>((s) => [s, updatePartyIn(s.vendors, id, input)]);
}
export async function createCustomer(
  input: PartyInput,
  channel: Channel = "ecom"
): Promise<PartyResult> {
  return mutate<PartyResult>((s) => [s, createPartyIn(s.customers, input, channel)]);
}
export async function updateCustomer(id: string, input: PartyInput): Promise<PartyResult> {
  return mutate<PartyResult>((s) => [s, updatePartyIn(s.customers, id, input)]);
}

/** Delete vendors by id. Historical receipts keep their vendor-name snapshot,
 *  so past purchases still read correctly. Returns the number removed. */
export async function deleteVendors(ids: string[]): Promise<number> {
  const set = new Set(ids.map((i) => i.trim()).filter(Boolean));
  if (set.size === 0) return 0;
  return mutate((store) => {
    const before = store.vendors.length;
    store.vendors = store.vendors.filter((v) => !set.has(v.id));
    return [store, before - store.vendors.length];
  });
}

/** Delete customers by id. Historical dispatches keep their customer-name
 *  snapshot. Returns the number removed. */
export async function deleteCustomers(ids: string[]): Promise<number> {
  const set = new Set(ids.map((i) => i.trim()).filter(Boolean));
  if (set.size === 0) return 0;
  return mutate((store) => {
    const before = store.customers.length;
    store.customers = store.customers.filter((c) => !set.has(c.id));
    return [store, before - store.customers.length];
  });
}

export async function getVendorDetail(id: string): Promise<VendorDetail | undefined> {
  const store = await readStore();
  const vendor = store.vendors.find((v) => v.id === id);
  if (!vendor) return undefined;
  const nameFor = (ean: string) =>
    findProduct(store, ean, vendor.channel)?.name ?? "Unknown product";
  const whName = (wid: string) =>
    store.warehouses.find((w) => w.id === wid)?.name ?? wid;

  const txns: PartyTxn[] = store.receipts
    .filter((r) => r.vendorId === id)
    .map((r) => ({
      id: r.id,
      date: r.date || r.createdAt.slice(0, 10),
      ean: r.ean,
      productName: nameFor(r.ean),
      quantity: r.quantity,
      ref: r.bill,
      amount:
        typeof r.purchasePrice === "number"
          ? r.purchasePrice * r.quantity
          : undefined,
      warehouseName: whName(r.warehouseId),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    ...vendor,
    txns,
    totalQuantity: txns.reduce((s, t) => s + t.quantity, 0),
    totalValue: txns.reduce((s, t) => s + (t.amount ?? 0), 0),
  };
}

export async function getCustomerDetail(
  id: string
): Promise<CustomerDetail | undefined> {
  const store = await readStore();
  const customer = store.customers.find((c) => c.id === id);
  if (!customer) return undefined;
  const productFor = (ean: string) => findProduct(store, ean, customer.channel);
  const whName = (wid: string) =>
    store.warehouses.find((w) => w.id === wid)?.name ?? wid;

  const txns: PartyTxn[] = store.dispatches
    .filter((d) => d.customerId === id)
    .map((d) => {
      const sp = productFor(d.ean)?.sellingPrice;
      return {
        id: d.id,
        date: d.date || d.createdAt.slice(0, 10),
        ean: d.ean,
        productName: productFor(d.ean)?.name ?? "Unknown product",
        quantity: d.quantity,
        ref: d.invoiceNo,
        amount: typeof sp === "number" ? sp * d.quantity : undefined,
        warehouseName: whName(d.warehouseId),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    ...customer,
    txns,
    totalQuantity: txns.reduce((s, t) => s + t.quantity, 0),
  };
}

// ---- Combos: bundles of different products ----------------------------------

/** Clean stored/user component rows: positive whole quantities, non-empty EAN,
 *  de-duplicated by EAN (last quantity wins). */
function normalizeComponents(raw: unknown): ComboComponent[] {
  if (!Array.isArray(raw)) return [];
  const byEan = new Map<string, number>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const k = item as Record<string, unknown>;
    const ean = typeof k.ean === "string" ? k.ean.trim() : "";
    const quantity = Number(k.quantity);
    if (!ean || !Number.isInteger(quantity) || quantity <= 0) continue;
    byEan.set(ean, quantity);
  }
  return [...byEan.entries()].map(([ean, quantity]) => ({ ean, quantity }));
}

/** True if a barcode collides with any product EAN/pack barcode, or another
 *  combo's barcode, within the given channel (ignoring the combo id === selfId). */
function barcodeInUse(
  store: Store,
  barcode: string,
  selfId: string | null,
  channel: Channel
): boolean {
  if (
    store.products.some(
      (p) =>
        p.channel === channel &&
        (p.ean === barcode || p.barcodes.some((b) => b.ean === barcode))
    )
  ) {
    return true;
  }
  return store.combos.some(
    (c) => c.channel === channel && c.id !== selfId && c.barcode === barcode
  );
}

function cleanComboInput(store: Store, input: ComboInput, channel: Channel) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const barcode =
    typeof input.barcode === "string" ? input.barcode.trim() || undefined : undefined;
  const price =
    typeof input.price === "number" && input.price >= 0 ? input.price : undefined;
  // Keep only components that point at a real product in this channel.
  const components = normalizeComponents(input.components).filter((c) =>
    store.products.some((p) => p.channel === channel && p.ean === c.ean)
  );
  return { name, barcode, price, components };
}

type ComboResult = { ok: true; combo: Combo } | { ok: false; error: string };

/** All combos in a channel, enriched with component product names. */
export async function listCombos(
  channel: Channel = "ecom"
): Promise<ComboView[]> {
  const store = await readStore();
  const nameFor = (ean: string) =>
    findProduct(store, ean, channel)?.name ?? "Unknown product";
  return store.combos
    .filter((c) => c.channel === channel)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      ...c,
      lines: c.components.map((k) => ({
        ean: k.ean,
        name: nameFor(k.ean),
        quantity: k.quantity,
      })),
    }));
}

export async function createCombo(
  input: ComboInput,
  channel: Channel = "ecom"
): Promise<ComboResult> {
  return mutate<ComboResult>((store) => {
    const c = cleanComboInput(store, input, channel);
    if (!c.name) return [store, { ok: false, error: "Combo name is required." }];
    if (!c.components.length) {
      return [store, { ok: false, error: "Add at least one product to the combo." }];
    }
    if (
      store.combos.some(
        (x) => x.channel === channel && x.name.toLowerCase() === c.name.toLowerCase()
      )
    ) {
      return [store, { ok: false, error: "A combo with this name already exists." }];
    }
    if (c.barcode && barcodeInUse(store, c.barcode, null, channel)) {
      return [
        store,
        { ok: false, error: "That barcode is already used by a product or combo." },
      ];
    }
    const combo: Combo = {
      id: randomUUID(),
      channel,
      name: c.name,
      barcode: c.barcode,
      price: c.price,
      components: c.components,
      createdAt: new Date().toISOString(),
    };
    store.combos.push(combo);
    return [store, { ok: true, combo }];
  });
}

export async function updateCombo(
  id: string,
  input: ComboInput
): Promise<ComboResult> {
  return mutate<ComboResult>((store) => {
    const combo = store.combos.find((c) => c.id === id);
    if (!combo) return [store, { ok: false, error: "Combo not found." }];
    const c = cleanComboInput(store, input, combo.channel);
    if (input.name !== undefined) {
      if (!c.name) return [store, { ok: false, error: "Combo name can't be empty." }];
      if (
        store.combos.some(
          (x) =>
            x.id !== id &&
            x.channel === combo.channel &&
            x.name.toLowerCase() === c.name.toLowerCase()
        )
      ) {
        return [store, { ok: false, error: "A combo with this name already exists." }];
      }
      combo.name = c.name;
    }
    if (input.barcode !== undefined) {
      if (c.barcode && barcodeInUse(store, c.barcode, id, combo.channel)) {
        return [
          store,
          { ok: false, error: "That barcode is already used by a product or combo." },
        ];
      }
      combo.barcode = c.barcode;
    }
    if (input.price !== undefined) combo.price = c.price;
    if (input.components !== undefined) {
      if (!c.components.length) {
        return [store, { ok: false, error: "A combo needs at least one product." }];
      }
      combo.components = c.components;
    }
    return [store, { ok: true, combo }];
  });
}

export async function deleteCombo(id: string): Promise<boolean> {
  return mutate((store) => {
    const before = store.combos.length;
    store.combos = store.combos.filter((c) => c.id !== id);
    return [store, store.combos.length !== before];
  });
}

/** Dispatch a batch of combos from a warehouse: verify every component has
 *  enough stock, then deduct all of them atomically and log the sale. Throws
 *  if any component is short (nothing is deducted). */
export async function dispatchCombo(
  warehouseId: string,
  input: ComboDispatchInput,
  by?: { id: string; name: string }
): Promise<ComboDispatch> {
  return mutate((store) => {
    const warehouse = store.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");

    const channel = warehouse.channel;
    const combo = store.combos.find((c) => c.id === input.comboId);
    if (!combo) throw new Error("Combo not found.");
    if (!combo.components.length) throw new Error("This combo has no products.");

    const count = input.combos;
    const nameFor = (ean: string) =>
      findProduct(store, ean, channel)?.name ?? ean;

    // First pass: verify every component (all-or-nothing).
    for (const comp of combo.components) {
      const need = comp.quantity * count;
      const have =
        store.stock.find(
          (s) => s.warehouseId === warehouseId && s.ean === comp.ean
        )?.quantity ?? 0;
      if (need > have) {
        throw new Error(
          `Not enough "${nameFor(comp.ean)}" — need ${need}, only ${have} in this warehouse.`
        );
      }
    }

    // Second pass: deduct each component.
    const components: ComboDispatchComponent[] = [];
    let totalPieces = 0;
    for (const comp of combo.components) {
      const need = comp.quantity * count;
      const row = store.stock.find(
        (s) => s.warehouseId === warehouseId && s.ean === comp.ean
      )!;
      row.quantity -= need;
      totalPieces += need;
      components.push({
        ean: comp.ean,
        name: nameFor(comp.ean),
        quantity: comp.quantity,
        pieces: need,
      });
    }

    const customerId = upsertPartyByName(
      store.customers,
      input.customerName,
      channel
    );

    const record: ComboDispatch = {
      id: randomUUID(),
      warehouseId,
      comboId: combo.id,
      comboName: combo.name,
      barcode: combo.barcode,
      combos: count,
      price: combo.price,
      amount: typeof combo.price === "number" ? combo.price * count : undefined,
      components,
      totalPieces,
      date: input.date,
      invoiceNo: input.invoiceNo,
      referenceNo: input.referenceNo,
      customerName: input.customerName?.trim() || undefined,
      customerId,
      byId: by?.id,
      byName: by?.name,
      createdAt: new Date().toISOString(),
    };
    store.comboDispatches.push(record);
    return [store, record];
  });
}

// ---- Purchase orders --------------------------------------------------------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Compute the carton/qty/tax totals for one PO line from its raw inputs. */
function computePOLine(input: POLineInput): POLineItem {
  const cartonSize = Math.max(0, Math.floor(Number(input.cartonSize) || 0));
  const cartonQty = Math.max(0, Math.floor(Number(input.cartonQty) || 0));
  const totalQty = cartonSize * cartonQty;
  const rate = Math.max(0, Number(input.rate) || 0);
  const taxRate = Math.max(0, Number(input.taxRate) || 0);
  const taxAmount = round2((rate * taxRate) / 100);
  const amount = round2(rate + taxAmount);
  const totalAmount = round2(amount * totalQty);
  return {
    hsnCode: input.hsnCode?.trim() || undefined,
    ean: input.ean.trim(),
    productCode: input.productCode?.trim() || undefined,
    description: input.description.trim(),
    cartonSize,
    cartonQty,
    totalQty,
    rate,
    taxRate,
    taxAmount,
    amount,
    totalAmount,
  };
}

/** Next sequential PO number, e.g. "PO-0001". */
function nextPONumber(store: Store): string {
  let max = 0;
  for (const po of store.purchaseOrders) {
    const m = /(\d+)\s*$/.exec(po.poNumber || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `PO-${String(max + 1).padStart(4, "0")}`;
}

type POResult =
  | { ok: true; po: PurchaseOrder }
  | { ok: false; error: string };

export async function listPurchaseOrders(
  channel: Channel = "ecom"
): Promise<PurchaseOrder[]> {
  const store = await readStore();
  return store.purchaseOrders
    .filter((p) => p.channel === channel)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPurchaseOrder(
  id: string
): Promise<PurchaseOrder | undefined> {
  const store = await readStore();
  return store.purchaseOrders.find((p) => p.id === id);
}

/** Create a purchase order. Admins get a "confirmed" PO directly; everyone else
 *  gets a "pending" PO awaiting admin approval. */
export async function createPurchaseOrder(
  input: PurchaseOrderInput,
  by: { id: string; name: string },
  isAdmin: boolean,
  channel: Channel = "ecom"
): Promise<POResult> {
  return mutate<POResult>((store) => {
    const vendorName =
      typeof input.vendorName === "string" ? input.vendorName.trim() : "";
    if (!vendorName) return [store, { ok: false, error: "Vendor name is required." }];
    const date = typeof input.date === "string" ? input.date.trim() : "";
    if (!date) return [store, { ok: false, error: "Date is required." }];

    const rawItems = Array.isArray(input.items) ? input.items : [];
    const items = rawItems
      .map(computePOLine)
      .filter((it) => it.ean && it.description && it.totalQty > 0);
    if (items.length === 0) {
      return [
        store,
        { ok: false, error: "Add at least one line with an EAN, description and quantity." },
      ];
    }

    // Only allow a warehouse from this channel.
    const warehouseId =
      input.warehouseId &&
      store.warehouses.some(
        (w) => w.id === input.warehouseId && w.channel === channel
      )
        ? input.warehouseId
        : undefined;
    const vendorId = upsertPartyByName(store.vendors, vendorName, channel);
    const grandTotal = round2(items.reduce((s, it) => s + it.totalAmount, 0));
    const now = new Date().toISOString();

    const po: PurchaseOrder = {
      id: randomUUID(),
      channel,
      poNumber: nextPONumber(store),
      date,
      warehouseId,
      vendorName,
      vendorId,
      invoiceNumber:
        typeof input.invoiceNumber === "string"
          ? input.invoiceNumber.trim() || undefined
          : undefined,
      items,
      grandTotal,
      status: isAdmin ? "confirmed" : "pending",
      requestedBy: by.id,
      requestedByName: by.name,
      createdAt: now,
      // Admin-created orders are confirmed immediately.
      decidedBy: isAdmin ? by.id : undefined,
      decidedByName: isAdmin ? by.name : undefined,
      decidedAt: isAdmin ? now : undefined,
    };
    store.purchaseOrders.push(po);
    return [store, { ok: true, po }];
  });
}

/** Admin: approve (→ confirmed) or reject a pending purchase order. Returns the
 *  updated PO, or null if not found / already decided. */
export async function decidePurchaseOrder(
  id: string,
  action: "approve" | "reject",
  decidedBy: { id: string; name: string }
): Promise<PurchaseOrder | null> {
  return mutate((store) => {
    const po = store.purchaseOrders.find((p) => p.id === id);
    if (!po || po.status !== "pending") return [store, null];
    po.status = action === "approve" ? "confirmed" : "rejected";
    po.decidedBy = decidedBy.id;
    po.decidedByName = decidedBy.name;
    po.decidedAt = new Date().toISOString();
    return [store, po];
  });
}

export async function deletePurchaseOrder(id: string): Promise<boolean> {
  return mutate((store) => {
    const before = store.purchaseOrders.length;
    store.purchaseOrders = store.purchaseOrders.filter((p) => p.id !== id);
    return [store, store.purchaseOrders.length !== before];
  });
}

/** Admin: edit a PO's header and/or line items (qty, price, product). Only
 *  allowed while pending or confirmed (not once received/rejected). Recomputes
 *  line totals and the grand total. */
export async function updatePurchaseOrder(
  id: string,
  input: {
    date?: string;
    vendorName?: string;
    invoiceNumber?: string;
    warehouseId?: string | null;
    items?: POLineInput[];
  }
): Promise<POResult> {
  return mutate<POResult>((store) => {
    const po = store.purchaseOrders.find((p) => p.id === id);
    if (!po) return [store, { ok: false, error: "PO not found." }];
    if (po.status === "received" || po.status === "rejected") {
      return [store, { ok: false, error: `Can't edit a ${po.status} PO.` }];
    }

    if (input.items !== undefined) {
      const items = (Array.isArray(input.items) ? input.items : [])
        .map(computePOLine)
        .filter((it) => it.ean && it.description && it.totalQty > 0);
      if (items.length === 0) {
        return [
          store,
          { ok: false, error: "Add at least one line with an EAN, description and quantity." },
        ];
      }
      po.items = items;
      po.grandTotal = round2(items.reduce((s, it) => s + it.totalAmount, 0));
    }
    if (typeof input.date === "string" && input.date.trim()) {
      po.date = input.date.trim();
    }
    if (typeof input.vendorName === "string" && input.vendorName.trim()) {
      po.vendorName = input.vendorName.trim();
      po.vendorId = upsertPartyByName(store.vendors, po.vendorName, po.channel);
    }
    if (input.invoiceNumber !== undefined) {
      po.invoiceNumber =
        typeof input.invoiceNumber === "string"
          ? input.invoiceNumber.trim() || undefined
          : undefined;
    }
    if (input.warehouseId !== undefined) {
      const wid = input.warehouseId || undefined;
      // Only accept a warehouse from the PO's own channel.
      if (
        !wid ||
        store.warehouses.some((w) => w.id === wid && w.channel === po.channel)
      ) {
        po.warehouseId = wid;
      }
    }
    return [store, { ok: true, po }];
  });
}

/** Admin: receive a confirmed PO's goods into a warehouse (stock-in). Each line
 *  is received into the PO's channel — creating the product if needed and
 *  recording the rate as the cost price — and the PO moves to "received". */
export async function receivePurchaseOrder(
  id: string,
  by: { id: string; name: string },
  warehouseIdOverride?: string
): Promise<POResult> {
  const store0 = await readStore();
  const po0 = store0.purchaseOrders.find((p) => p.id === id);
  if (!po0) return { ok: false, error: "PO not found." };
  if (po0.status !== "confirmed") {
    return { ok: false, error: "Only a confirmed PO can be stocked in." };
  }
  const warehouseId = warehouseIdOverride || po0.warehouseId;
  if (!warehouseId) {
    return { ok: false, error: "Choose a warehouse to receive the goods into." };
  }
  const wh = store0.warehouses.find((w) => w.id === warehouseId);
  if (!wh) return { ok: false, error: "Warehouse not found." };
  if (wh.channel !== po0.channel) {
    return { ok: false, error: "Warehouse must be in the PO's channel." };
  }

  const bill = po0.invoiceNumber || po0.poNumber;
  const date = new Date().toISOString().slice(0, 10);
  // Receive each line (each its own mutation). receiveStock creates the product
  // in the warehouse's channel if missing and records the cost price.
  for (const it of po0.items) {
    await receiveStock(warehouseId, {
      ean: it.ean,
      quantity: it.totalQty,
      name: it.description,
      bill,
      vendorName: po0.vendorName,
      date,
      purchasePrice: it.rate,
    }, by);
  }

  return mutate<POResult>((store) => {
    const po = store.purchaseOrders.find((p) => p.id === id);
    if (!po) return [store, { ok: false, error: "PO not found." }];
    if (po.status !== "confirmed") {
      return [store, { ok: false, error: "PO already processed." }];
    }
    po.status = "received";
    po.warehouseId = warehouseId;
    po.receivedAt = new Date().toISOString();
    po.receivedByName = by.name;
    return [store, { ok: true, po }];
  });
}

// ---- Release orders (incoming orders → stock-out) ---------------------------

function nextRONumber(store: Store): string {
  let max = 0;
  for (const ro of store.releaseOrders) {
    const m = /(\d+)\s*$/.exec(ro.roNumber || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `RO-${String(max + 1).padStart(4, "0")}`;
}

type ROResult = { ok: true; ro: ReleaseOrder } | { ok: false; error: string };

export async function listReleaseOrders(
  channel: Channel = "ecom"
): Promise<ReleaseOrder[]> {
  const store = await readStore();
  return store.releaseOrders
    .filter((r) => r.channel === channel)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getReleaseOrder(
  id: string
): Promise<ReleaseOrder | undefined> {
  const store = await readStore();
  return store.releaseOrders.find((r) => r.id === id);
}

/** Create a release order and dispatch it: deduct each line's quantity from the
 *  warehouse (all-or-nothing) and log a dispatch per line. Throws on any EAN
 *  that doesn't resolve / isn't stocked / is short. */
export async function createReleaseOrder(
  input: ReleaseOrderInput,
  by?: { id: string; name: string },
  isAdmin = false
): Promise<ROResult> {
  return mutate<ROResult>((store) => {
    const warehouse = store.warehouses.find((w) => w.id === input.warehouseId);
    if (!warehouse) return [store, { ok: false, error: "Warehouse not found." }];
    const channel = warehouse.channel;
    const date = typeof input.date === "string" ? input.date.trim() : "";
    if (!date) return [store, { ok: false, error: "Date is required." }];
    const rawLines = Array.isArray(input.lines) ? input.lines : [];
    if (rawLines.length === 0) {
      return [store, { ok: false, error: "Add at least one line." }];
    }

    // Resolve each line to a product + piece count.
    const resolved = rawLines.map((ln) => {
      const scanned = String(ln.ean ?? "").trim();
      const product = resolveProduct(store, scanned, channel);
      const quantity = Math.max(0, Math.floor(Number(ln.quantity) || 0));
      const landingRate = Math.max(0, Number(ln.landingRate) || 0);
      const gstRate = Math.max(0, Number(ln.gstRate) || 0);
      return { ln, scanned, product, stockEan: product?.ean ?? scanned, quantity, landingRate, gstRate };
    });

    // Validate: every EAN resolves and quantity > 0 (always). Stock-sufficiency
    // is only enforced when the RO dispatches now (admin) — a staff RO waits in
    // "pending" and is re-checked at approval time.
    const need = new Map<string, number>();
    const errors: string[] = [];
    for (const r of resolved) {
      if (!r.product) errors.push(`EAN ${r.scanned} not in catalog`);
      if (r.quantity <= 0) errors.push(`EAN ${r.scanned}: quantity must be > 0`);
      need.set(r.stockEan, (need.get(r.stockEan) ?? 0) + r.quantity);
    }
    if (isAdmin) {
      for (const [stockEan, total] of need) {
        const have =
          store.stock.find((s) => s.warehouseId === input.warehouseId && s.ean === stockEan)
            ?.quantity ?? 0;
        if (total > have) {
          const name = findProduct(store, stockEan, channel)?.name ?? stockEan;
          errors.push(`"${name}" — need ${total}, only ${have} in stock`);
        }
      }
    }
    if (errors.length) {
      return [store, { ok: false, error: errors.join("; ") + "." }];
    }

    // Build the RO line items + totals (no stock touched yet).
    const customerId = upsertPartyByName(
      store.customers,
      input.customerName || input.source,
      channel
    );
    const now = new Date().toISOString();
    const roNumber = nextRONumber(store);
    const items: ROLineItem[] = [];
    let totalQuantity = 0;
    let totalAmount = 0;

    for (const r of resolved) {
      const taxAmount = round2((r.landingRate * r.gstRate) / (100 + r.gstRate));
      const lineTotal = round2(r.landingRate * r.quantity);
      totalQuantity += r.quantity;
      totalAmount += lineTotal;

      items.push({
        itemCode: r.ln.itemCode?.trim() || undefined,
        ean: r.stockEan,
        description: r.ln.description?.trim() || r.product!.name,
        grammage: r.ln.grammage?.trim() || undefined,
        gstRate: r.gstRate,
        taxAmount,
        landingRate: r.landingRate,
        quantity: r.quantity,
        mrp: typeof r.ln.mrp === "number" ? r.ln.mrp : undefined,
        totalAmount: lineTotal,
      });
    }

    // Admin dispatches immediately: deduct stock + log dispatches. Staff ROs
    // stay pending and deduct nothing until an admin approves.
    if (isAdmin) {
      for (const r of resolved) {
        const row = store.stock.find(
          (s) => s.warehouseId === input.warehouseId && s.ean === r.stockEan
        )!;
        row.quantity -= r.quantity;

        store.dispatches.push({
          id: randomUUID(),
          warehouseId: input.warehouseId,
          ean: r.stockEan,
          unitSize: 1,
          packs: r.quantity,
          quantity: r.quantity,
          date,
          invoiceNo: roNumber,
          referenceNo: input.source || undefined,
          customerName: input.customerName?.trim() || input.source || undefined,
          customerId,
          byId: by?.id,
          byName: by?.name,
          createdAt: now,
        });
      }
    }

    const cartDiscount = Math.max(0, Number(input.cartDiscount) || 0);
    totalAmount = round2(totalAmount);
    const ro: ReleaseOrder = {
      id: randomUUID(),
      channel,
      roNumber,
      date,
      source: input.source?.trim() || undefined,
      warehouseId: input.warehouseId,
      customerName: input.customerName?.trim() || undefined,
      items,
      totalQuantity,
      totalAmount,
      cartDiscount,
      netAmount: round2(totalAmount - cartDiscount),
      status: isAdmin ? "dispatched" : "pending",
      createdBy: by?.id,
      createdByName: by?.name,
      createdAt: now,
      decidedBy: isAdmin ? by?.id : undefined,
      decidedByName: isAdmin ? by?.name : undefined,
      decidedAt: isAdmin ? now : undefined,
    };
    store.releaseOrders.push(ro);
    return [store, { ok: true, ro }];
  });
}

/** Admin decision on a pending release order. "approve" re-validates stock,
 *  deducts it, and logs dispatches (marking the RO "dispatched"); "reject"
 *  simply marks it "rejected" with no stock change. */
export async function decideReleaseOrder(
  id: string,
  action: "approve" | "reject",
  by: { id: string; name: string }
): Promise<ROResult> {
  return mutate<ROResult>((store) => {
    const ro = store.releaseOrders.find((r) => r.id === id);
    if (!ro) return [store, { ok: false, error: "Release order not found." }];
    if (ro.status !== "pending") {
      return [store, { ok: false, error: "This release order is already decided." }];
    }
    const now = new Date().toISOString();

    if (action === "reject") {
      ro.status = "rejected";
      ro.decidedBy = by.id;
      ro.decidedByName = by.name;
      ro.decidedAt = now;
      return [store, { ok: true, ro }];
    }

    // approve: re-validate combined stock, then deduct + log dispatches.
    const need = new Map<string, number>();
    for (const it of ro.items) {
      need.set(it.ean, (need.get(it.ean) ?? 0) + it.quantity);
    }
    const errors: string[] = [];
    for (const [stockEan, total] of need) {
      const have =
        store.stock.find((s) => s.warehouseId === ro.warehouseId && s.ean === stockEan)
          ?.quantity ?? 0;
      if (total > have) {
        const name = findProduct(store, stockEan, ro.channel)?.name ?? stockEan;
        errors.push(`"${name}" — need ${total}, only ${have} in stock`);
      }
    }
    if (errors.length) {
      return [store, { ok: false, error: errors.join("; ") + "." }];
    }

    const customerId = upsertPartyByName(
      store.customers,
      ro.customerName || ro.source,
      ro.channel
    );
    for (const it of ro.items) {
      const row = store.stock.find(
        (s) => s.warehouseId === ro.warehouseId && s.ean === it.ean
      )!;
      row.quantity -= it.quantity;
      store.dispatches.push({
        id: randomUUID(),
        warehouseId: ro.warehouseId,
        ean: it.ean,
        unitSize: 1,
        packs: it.quantity,
        quantity: it.quantity,
        date: ro.date,
        invoiceNo: ro.roNumber,
        referenceNo: ro.source || undefined,
        customerName: ro.customerName || ro.source || undefined,
        customerId,
        // Credit the staff member who raised the RO; the approving admin is
        // recorded separately on the RO as decidedBy/decidedByName.
        byId: ro.createdBy,
        byName: ro.createdByName,
        createdAt: now,
      });
    }

    ro.status = "dispatched";
    ro.decidedBy = by.id;
    ro.decidedByName = by.name;
    ro.decidedAt = now;
    return [store, { ok: true, ro }];
  });
}

export async function deleteReleaseOrder(id: string): Promise<boolean> {
  return mutate((store) => {
    const before = store.releaseOrders.length;
    store.releaseOrders = store.releaseOrders.filter((r) => r.id !== id);
    return [store, store.releaseOrders.length !== before];
  });
}

// ---- Users & sessions -------------------------------------------------------

const SESSION_DAYS = 7;

function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    active: u.active,
    warehouseId: u.warehouseId,
    createdAt: u.createdAt,
  };
}

/** Create the first admin user on a fresh store (username "admin", password
 *  from ADMIN_PASSWORD). Idempotent — does nothing once any user exists. */
export async function ensureAdminSeeded(): Promise<void> {
  // Fast path: don't take a write lock on every request once seeded.
  if ((await readStore()).users.length > 0) return;
  await mutate((store) => {
    if (store.users.length === 0) {
      store.users.push({
        id: randomUUID(),
        username: "admin",
        name: "Administrator",
        role: "admin",
        passwordHash: hashPassword(adminPassword()),
        active: true,
        createdAt: new Date().toISOString(),
      });
    }
    return [store, undefined];
  });
}

export async function findUserByUsername(username: string): Promise<User | undefined> {
  const store = await readStore();
  const u = username.trim().toLowerCase();
  return store.users.find((x) => x.username.toLowerCase() === u);
}

/** All active users with the given role (for role-based login). */
export async function findActiveUsersByRole(role: Role): Promise<User[]> {
  const store = await readStore();
  return store.users.filter((u) => u.role === role && u.active);
}

export async function listUsers(): Promise<PublicUser[]> {
  const store = await readStore();
  return store.users
    .map(toPublicUser)
    .sort((a, b) => a.username.localeCompare(b.username));
}

type UserResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string };

export async function createUser(input: {
  username: string;
  name: string;
  role: Role;
  password: string;
  warehouseId?: string;
}): Promise<UserResult> {
  return mutate<UserResult>((store) => {
    const username = input.username.trim();
    if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return [store, { ok: false, error: "Username already exists." } as const];
    }
    // Staff can be tied to a warehouse; admins always see all.
    const warehouseId =
      input.role === "staff" && input.warehouseId?.trim()
        ? input.warehouseId.trim()
        : undefined;
    const user: User = {
      id: randomUUID(),
      username,
      name: input.name.trim() || username,
      role: input.role,
      passwordHash: hashPassword(input.password),
      active: true,
      warehouseId,
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
    return [store, { ok: true, user: toPublicUser(user) } as const];
  });
}

export async function updateUser(
  id: string,
  patch: {
    name?: string;
    role?: Role;
    active?: boolean;
    password?: string;
    warehouseId?: string | null;
  }
): Promise<UserResult> {
  return mutate<UserResult>((store) => {
    const user = store.users.find((u) => u.id === id);
    if (!user) return [store, { ok: false, error: "User not found." } as const];

    // Don't allow disabling or demoting the last active admin.
    const activeAdmins = store.users.filter((u) => u.role === "admin" && u.active);
    const isLastAdmin =
      user.role === "admin" && user.active && activeAdmins.length === 1;
    if (isLastAdmin && (patch.active === false || (patch.role && patch.role !== "admin"))) {
      return [store, { ok: false, error: "Can't disable or demote the last admin." } as const];
    }

    if (typeof patch.name === "string" && patch.name.trim()) user.name = patch.name.trim();
    if (patch.role) user.role = patch.role;
    if (typeof patch.active === "boolean") user.active = patch.active;
    if (patch.password) user.passwordHash = hashPassword(patch.password);
    if (patch.warehouseId !== undefined) {
      user.warehouseId = patch.warehouseId?.trim() || undefined;
    }
    // Admins are never warehouse-limited.
    if (user.role === "admin") user.warehouseId = undefined;
    return [store, { ok: true, user: toPublicUser(user) } as const];
  });
}

/** Open a session for a user and return its token. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await mutate((store) => {
    // Drop expired sessions while we're here.
    store.sessions = store.sessions.filter(
      (s) => new Date(s.expiresAt).getTime() > now
    );
    store.sessions.push({
      token,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_DAYS * 86400000).toISOString(),
    });
    return [store, undefined];
  });
  return token;
}

/** Resolve a session token to its (active) user, or null. */
export async function getSessionUser(token: string | null): Promise<User | null> {
  if (!token) return null;
  const store = await readStore();
  const session = store.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  const user = store.users.find((u) => u.id === session.userId);
  if (!user || !user.active) return null;
  return user;
}

export async function deleteSession(token: string | null): Promise<void> {
  if (!token) return;
  await mutate((store) => {
    store.sessions = store.sessions.filter((s) => s.token !== token);
    return [store, undefined];
  });
}

export { toPublicUser };
