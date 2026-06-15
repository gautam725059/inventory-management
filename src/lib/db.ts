import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  Store,
  Warehouse,
  WarehouseSummary,
  WarehouseDetail,
  WarehouseStockLine,
  ComboAvailability,
  ReceiveInput,
  DispatchInput,
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
      products: Array.isArray(parsed.products) ? parsed.products : [],
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

// ---- Reads ------------------------------------------------------------------

export async function listWarehouses(): Promise<WarehouseSummary[]> {
  const store = await readStore();
  return store.warehouses.map((w) => {
    const rows = store.stock.filter((s) => s.warehouseId === w.id && s.quantity > 0);
    return {
      ...w,
      skuCount: rows.length,
      totalUnits: rows.reduce((sum, r) => sum + r.quantity, 0),
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
    .map((s) => {
      const product = store.products.find((p) => p.ean === s.ean);
      const comboSizes = product?.comboSizes ?? [];
      return {
        ean: s.ean,
        name: product?.name ?? "Unknown product",
        quantity: s.quantity,
        comboSizes,
        combos: computeCombos(s.quantity, comboSizes),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...warehouse,
    lines,
    totalUnits: lines.reduce((sum, l) => sum + l.quantity, 0),
  };
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
      };
      store.products.push(product);
    } else {
      if (input.name?.trim()) product.name = input.name.trim();
      if (input.comboSizes) product.comboSizes = input.comboSizes;
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

    const line: WarehouseStockLine = {
      ean,
      name: product.name,
      quantity: row.quantity,
      comboSizes: product.comboSizes,
      combos: computeCombos(row.quantity, product.comboSizes),
    };
    return [store, line];
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
    const comboSizes = product?.comboSizes ?? [];
    const line: WarehouseStockLine = {
      ean,
      name: product?.name ?? "Unknown product",
      quantity: row.quantity,
      comboSizes,
      combos: computeCombos(row.quantity, comboSizes),
    };
    return [store, line];
  });
}

/** Update the combo (pack) sizes a product can be sold in. */
export async function setComboSizes(
  ean: string,
  comboSizes: number[]
): Promise<boolean> {
  return mutate((store) => {
    const product = store.products.find((p) => p.ean === ean);
    if (!product) return [store, false];
    product.comboSizes = comboSizes.filter((s) => s > 0);
    return [store, true];
  });
}
