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
  Warehouse,
  Product,
  PackBarcode,
  WarehouseSummary,
  WarehouseDetail,
  WarehouseStockLine,
  ComboAvailability,
  Movement,
  ProductCatalogEntry,
  ReceiveInput,
  DispatchInput,
  ProductUpdateInput,
  Approval,
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
  ImportItem,
  ImportResult,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

// The three warehouses are seeded on first run. Each holds its own stock.
const DEFAULT_WAREHOUSES: Warehouse[] = [
  { id: "wh-mumbai", name: "Mumbai Warehouse", location: "Bhiwandi, MH" },
  { id: "wh-delhi", name: "Delhi Warehouse", location: "Okhla, DL" },
  { id: "wh-bengaluru", name: "Bengaluru Warehouse", location: "Whitefield, KA" },
];

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
    adjustments: [],
    transfers: [],
    approvals: [],
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
    warehouses:
      Array.isArray(parsed.warehouses) && parsed.warehouses.length > 0
        ? parsed.warehouses
        : emptyStore().warehouses,
    // Normalize products so older records gain the newer fields.
    products: Array.isArray(parsed.products)
      ? parsed.products.map((p) => ({
          ...p,
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
    vendors: Array.isArray(parsed.vendors) ? parsed.vendors : [],
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    stock: Array.isArray(parsed.stock) ? parsed.stock : [],
    receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
    dispatches: Array.isArray(parsed.dispatches) ? parsed.dispatches : [],
    adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
    transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
    approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
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
    lowStock: reorderLevel > 0 && quantity <= reorderLevel,
    imageUrl: product?.imageUrl,
  };
}

/** Find a party by case-insensitive name, creating it if new. Returns its id
 *  (or undefined for a blank name). Mutates the passed list. */
function upsertPartyByName(
  list: Vendor[],
  name: string | undefined
): string | undefined {
  const n = name?.trim();
  if (!n) return undefined;
  const existing = list.find((p) => p.name.toLowerCase() === n.toLowerCase());
  if (existing) return existing.id;
  const created: Vendor = {
    id: randomUUID(),
    name: n,
    createdAt: new Date().toISOString(),
  };
  list.push(created);
  return created.id;
}

// ---- Reads ------------------------------------------------------------------

export async function listWarehouses(): Promise<WarehouseSummary[]> {
  const store = await readStore();
  return store.warehouses.map((w) => {
    const rows = store.stock.filter((s) => s.warehouseId === w.id && s.quantity > 0);
    const lowStockCount = rows.filter((r) => {
      const product = store.products.find((p) => p.ean === r.ean);
      const reorderLevel = product?.reorderLevel ?? 0;
      return reorderLevel > 0 && r.quantity <= reorderLevel;
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
      buildLine(
        store.products.find((p) => p.ean === s.ean),
        s.ean,
        s.quantity
      )
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
    store.products.find((p) => p.ean === ean)?.name ?? "Unknown product";

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

  return [...ins, ...outs, ...adjusts, ...transfers].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/** All distinct products with stock totalled across every warehouse. */
export async function listCatalog(): Promise<ProductCatalogEntry[]> {
  const store = await readStore();
  return store.products
    .map((p) => {
      const byWarehouse = store.warehouses.map((w) => ({
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
        comboSizes: p.comboSizes,
        barcodes: p.barcodes,
        reorderLevel: p.reorderLevel,
        sellingPrice: p.sellingPrice,
        purchasePrice: p.purchasePrice,
        totalQuantity,
        lowStock: p.reorderLevel > 0 && totalQuantity <= p.reorderLevel,
        byWarehouse,
        imageUrl: p.imageUrl,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Writes -----------------------------------------------------------------

/** Receive a batch of goods into a warehouse. The scanned EAN may be a
 *  product's primary EAN or any of its pack barcodes — it is resolved to the
 *  product. Creates the product only if the EAN matches nothing. */
export async function receiveStock(
  warehouseId: string,
  input: ReceiveInput
): Promise<WarehouseStockLine> {
  return mutate((store) => {
    const warehouse = store.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");

    const scanned = input.ean.trim();

    // Resolve to an existing product by primary EAN first, then pack barcode.
    let product =
      store.products.find((p) => p.ean === scanned) ??
      store.products.find((p) => p.barcodes.some((b) => b.ean === scanned));

    if (!product) {
      product = {
        ean: scanned,
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

    const vendorId = upsertPartyByName(store.vendors, input.vendorName);

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
      createdAt: new Date().toISOString(),
    });

    return [store, buildLine(product, stockEan, row.quantity)];
  });
}

/** Dispatch goods out of a warehouse as packs (stock-out). The scanned `ean`
 *  may be the product's primary EAN or any of its pack barcodes; it is resolved
 *  to the product, then `unitSize * packs` pieces are removed from that
 *  product's stock. Throws if stock is insufficient. */
export async function dispatchStock(
  warehouseId: string,
  input: DispatchInput
): Promise<WarehouseStockLine> {
  return mutate((store) => {
    const warehouse = store.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");

    const scanned = input.ean.trim();
    // Resolve the scanned barcode to its product — match the primary EAN first,
    // then any registered pack barcode.
    const product =
      store.products.find((p) => p.ean === scanned) ??
      store.products.find((p) => p.barcodes.some((b) => b.ean === scanned));
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

    const customerId = upsertPartyByName(store.customers, input.customerName);

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
      createdAt: new Date().toISOString(),
    });

    return [store, buildLine(product, stockEan, row.quantity)];
  });
}

/** Bulk-import master products with their pack barcodes. Creates new products,
 *  merges packs into existing ones (updating size/name/price on matching EANs).
 *  Pack EANs that collide with another product's primary EAN are skipped. */
export async function importCatalog(items: ImportItem[]): Promise<ImportResult> {
  return mutate<ImportResult>((store) => {
    let productsCreated = 0;
    let productsUpdated = 0;
    let packsAdded = 0;

    for (const item of items) {
      const ean = item.ean.trim();
      if (!ean) continue;

      let product = store.products.find((p) => p.ean === ean);
      if (!product) {
        product = {
          ean,
          name: item.name.trim() || `Product ${ean}`,
          comboSizes: [],
          barcodes: [],
          reorderLevel: 0,
        };
        store.products.push(product);
        productsCreated++;
      } else {
        if (item.name.trim()) product.name = item.name.trim();
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

      // EANs owned by OTHER products (can't reuse as a pack barcode here).
      const otherPrimary = new Set(
        store.products.filter((p) => p.ean !== product!.ean).map((p) => p.ean)
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
  input: ProductUpdateInput
): Promise<boolean> {
  return mutate((store) => {
    const product = store.products.find((p) => p.ean === ean);
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
        if (p.ean === product.ean) continue;
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

    const product = store.products.find((p) => p.ean === ean);
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

    const product = store.products.find((p) => p.ean === ean);
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
export async function getValuation(): Promise<InventoryValuation> {
  const store = await readStore();
  const products: ProductValue[] = store.products
    .map((p) => {
      const quantity = store.stock
        .filter((s) => s.ean === p.ean)
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
export async function getReports(from?: string, to?: string): Promise<Report> {
  const store = await readStore();
  const product = (ean: string) => store.products.find((p) => p.ean === ean);
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

  // Low stock across all warehouses.
  const lowStock: LowStockRow[] = store.stock
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
    .filter((r) => r.reorderLevel > 0 && r.quantity <= r.reorderLevel)
    .sort((a, b) => a.quantity - b.quantity);

  const valuation = await getValuation();

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

// ---- Admin: stock-in approvals ----------------------------------------------

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

/** All approvals, newest first. */
export async function listApprovals(): Promise<Approval[]> {
  const store = await readStore();
  return [...store.approvals].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
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

  if (action === "approve") {
    await receiveStock(approval.warehouseId, approval.payload);
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

export async function listVendors(): Promise<Vendor[]> {
  const store = await readStore();
  return [...store.vendors].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCustomers(): Promise<Customer[]> {
  const store = await readStore();
  return [...store.customers].sort((a, b) => a.name.localeCompare(b.name));
}

function createPartyIn(list: Vendor[], input: PartyInput): PartyResult {
  const c = cleanPartyInput(input);
  if (!c.name) return { ok: false, error: "Name is required." };
  if (list.some((p) => p.name.toLowerCase() === c.name!.toLowerCase())) {
    return { ok: false, error: "A record with this name already exists." };
  }
  const party: Vendor = {
    id: randomUUID(),
    name: c.name,
    phone: c.phone,
    gstin: c.gstin,
    address: c.address,
    note: c.note,
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
        (p) => p.id !== id && p.name.toLowerCase() === c.name!.toLowerCase()
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

export async function createVendor(input: PartyInput): Promise<PartyResult> {
  return mutate<PartyResult>((s) => [s, createPartyIn(s.vendors, input)]);
}
export async function updateVendor(id: string, input: PartyInput): Promise<PartyResult> {
  return mutate<PartyResult>((s) => [s, updatePartyIn(s.vendors, id, input)]);
}
export async function createCustomer(input: PartyInput): Promise<PartyResult> {
  return mutate<PartyResult>((s) => [s, createPartyIn(s.customers, input)]);
}
export async function updateCustomer(id: string, input: PartyInput): Promise<PartyResult> {
  return mutate<PartyResult>((s) => [s, updatePartyIn(s.customers, id, input)]);
}

export async function getVendorDetail(id: string): Promise<VendorDetail | undefined> {
  const store = await readStore();
  const vendor = store.vendors.find((v) => v.id === id);
  if (!vendor) return undefined;
  const nameFor = (ean: string) =>
    store.products.find((p) => p.ean === ean)?.name ?? "Unknown product";
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
  const productFor = (ean: string) => store.products.find((p) => p.ean === ean);
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

// ---- Users & sessions -------------------------------------------------------

const SESSION_DAYS = 7;

function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    active: u.active,
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
}): Promise<UserResult> {
  return mutate<UserResult>((store) => {
    const username = input.username.trim();
    if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return [store, { ok: false, error: "Username already exists." } as const];
    }
    const user: User = {
      id: randomUUID(),
      username,
      name: input.name.trim() || username,
      role: input.role,
      passwordHash: hashPassword(input.password),
      active: true,
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
    return [store, { ok: true, user: toPublicUser(user) } as const];
  });
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: Role; active?: boolean; password?: string }
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
