import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  Store,
  Warehouse,
  Product,
  WarehouseSummary,
  WarehouseDetail,
  WarehouseStockLine,
  ComboAvailability,
  Movement,
  ProductCatalogEntry,
  ReceiveInput,
  DispatchInput,
  ProductUpdateInput,
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
    warehouses: DEFAULT_WAREHOUSES.map((w) => ({ ...w })),
    products: [],
    stock: [],
    receipts: [],
    dispatches: [],
  };
}

// Serialize writes so concurrent requests can't clobber the file.
let writeChain: Promise<unknown> = Promise.resolve();

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      warehouses:
        Array.isArray(parsed.warehouses) && parsed.warehouses.length > 0
          ? parsed.warehouses
          : emptyStore().warehouses,
      // Normalize products so older records gain the reorderLevel field.
      products: Array.isArray(parsed.products)
        ? parsed.products.map((p) => ({
            ...p,
            comboSizes: Array.isArray(p.comboSizes) ? p.comboSizes : [],
            reorderLevel: typeof p.reorderLevel === "number" ? p.reorderLevel : 0,
            imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : undefined,
          }))
        : [],
      stock: Array.isArray(parsed.stock) ? parsed.stock : [],
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
      dispatches: Array.isArray(parsed.dispatches) ? parsed.dispatches : [],
    };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw err;
  }
}

async function writeStore(store: Store): Promise<void> {
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
    reorderLevel,
    lowStock: reorderLevel > 0 && quantity <= reorderLevel,
    imageUrl: product?.imageUrl,
  };
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
      createdAt: d.createdAt,
    }));

  return [...ins, ...outs].sort((a, b) =>
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
        reorderLevel: p.reorderLevel,
        totalQuantity,
        lowStock: p.reorderLevel > 0 && totalQuantity <= p.reorderLevel,
        byWarehouse,
        imageUrl: p.imageUrl,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Writes -----------------------------------------------------------------

/** Receive a batch of goods into a warehouse. Creates the product if its EAN
 *  is new, otherwise tops up existing stock. */
export async function receiveStock(
  warehouseId: string,
  input: ReceiveInput
): Promise<WarehouseStockLine> {
  return mutate((store) => {
    const warehouse = store.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");

    const ean = input.ean.trim();

    // Upsert the product record (shared across warehouses).
    let product = store.products.find((p) => p.ean === ean);
    if (!product) {
      product = {
        ean,
        name: input.name?.trim() || `Product ${ean}`,
        comboSizes: input.comboSizes ?? [],
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

    // Add to (or create) the per-warehouse stock row.
    let row = store.stock.find(
      (s) => s.warehouseId === warehouseId && s.ean === ean
    );
    if (!row) {
      row = { warehouseId, ean, quantity: 0 };
      store.stock.push(row);
    }
    row.quantity += input.quantity;

    store.receipts.push({
      id: randomUUID(),
      warehouseId,
      ean,
      quantity: input.quantity,
      createdAt: new Date().toISOString(),
    });

    return [store, buildLine(product, ean, row.quantity)];
  });
}

/** Dispatch goods out of a warehouse as packs (stock-out). Removes
 *  `unitSize * packs` pieces from stock. Throws if stock is insufficient. */
export async function dispatchStock(
  warehouseId: string,
  input: DispatchInput
): Promise<WarehouseStockLine> {
  return mutate((store) => {
    const warehouse = store.warehouses.find((w) => w.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");

    const ean = input.ean.trim();
    const row = store.stock.find(
      (s) => s.warehouseId === warehouseId && s.ean === ean
    );
    if (!row) throw new Error("This product is not stocked in this warehouse.");

    const pieces = input.unitSize * input.packs;
    if (pieces > row.quantity) {
      throw new Error(
        `Not enough stock. ${pieces} pieces requested but only ${row.quantity} available.`
      );
    }
    row.quantity -= pieces;

    store.dispatches.push({
      id: randomUUID(),
      warehouseId,
      ean,
      unitSize: input.unitSize,
      packs: input.packs,
      quantity: pieces,
      createdAt: new Date().toISOString(),
    });

    const product = store.products.find((p) => p.ean === ean);
    return [store, buildLine(product, ean, row.quantity)];
  });
}

/** Update a product's name, combo (pack) sizes, and/or reorder level. */
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
    if (typeof input.reorderLevel === "number") {
      product.reorderLevel = Math.max(0, Math.floor(input.reorderLevel));
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
