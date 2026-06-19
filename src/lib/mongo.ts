import { MongoClient, type Db, type Collection } from "mongodb";
import type { Store } from "./types";

/** The single store document: the whole Store nested under `data`. */
interface AppDoc {
  _id: string;
  data: Store;
}

// ---------------------------------------------------------------------------
// MongoDB connection. The whole Store is kept as a single document
// ({ _id: "store", ...store }) in the "app" collection, so every existing
// db.ts function keeps working unchanged — only readStore/writeStore switch
// from the filesystem to Mongo. Pragmatic first migration; can be normalized
// into per-collection later.
// ---------------------------------------------------------------------------

const STORE_DOC_ID = "store";

/** True only when a real connection string is configured (placeholder URIs that
 *  still contain "<...>" are ignored so the app falls back to the JSON file). */
export function mongoEnabled(): boolean {
  const uri = process.env.MONGODB_URI;
  return !!uri && !uri.includes("<");
}

function dbName(): string {
  return process.env.MONGODB_DB?.trim() || "inventory";
}

// Cache the client across hot reloads / lambda invocations.
const g = globalThis as unknown as { _mongoClient?: Promise<MongoClient> };

function clientPromise(): Promise<MongoClient> {
  if (!g._mongoClient) {
    const client = new MongoClient(process.env.MONGODB_URI as string, {
      // Fail fast instead of hanging when the cluster is unreachable.
      serverSelectionTimeoutMS: 8000,
    });
    // IMPORTANT: don't cache a *rejected* connection promise. If the first
    // connect fails (DNS/SRV refused, cluster down, IP not allowlisted), clear
    // the cache so the next request retries instead of failing instantly
    // forever.
    g._mongoClient = client.connect().catch((err) => {
      g._mongoClient = undefined;
      throw err;
    });
  }
  return g._mongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(dbName());
}

async function storeCollection(): Promise<Collection<AppDoc>> {
  const db = await getDb();
  return db.collection<AppDoc>("app");
}

/** Read the stored Store, or null if it doesn't exist yet. */
export async function mongoReadStoreDoc(): Promise<Partial<Store> | null> {
  const col = await storeCollection();
  const doc = await col.findOne({ _id: STORE_DOC_ID });
  return doc ? doc.data : null;
}

/** Upsert the whole store as a single document. */
export async function mongoWriteStore(store: Store): Promise<void> {
  const col = await storeCollection();
  await col.replaceOne(
    { _id: STORE_DOC_ID },
    { data: store },
    { upsert: true }
  );
}
