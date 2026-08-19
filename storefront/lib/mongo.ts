import "server-only";
import { MongoClient, type Db } from "mongodb";

/**
 * Mongo client for a serverless runtime.
 *
 * The pool settings below are sized for this app's actual shape, not copied
 * from a template. Stated assumptions, since they drive every number:
 *
 *   - Vercel Functions on Fluid Compute. Instances are reused across
 *     invocations, so a module-level client survives between requests. This
 *     is the single most important thing on the page: a client created inside
 *     the handler would pay TCP + TLS + auth on every call and churn
 *     connections against the cluster.
 *   - Traffic is a workshop demo, hard-capped at SUPPORT_DAILY_CAP (600/day).
 *     Peak realistic concurrency is a room of ~40 people submitting at once.
 *   - Each request performs two tiny indexed upserts. Sub-millisecond server
 *     side; the wall time is network.
 *   - Free-tier (M0) Atlas clusters cap total connections, so a small pool per
 *     instance matters — several warm Vercel instances each hold their own.
 *
 * If this ever becomes a real workload, revisit maxPoolSize against observed
 * concurrency rather than raising it on a hunch.
 */

const URI =
  process.env.MONGODB_URI ??
  process.env.MONGODB_ATLAS_URI ??
  process.env.DATABASE_URL;

export const HAS_MONGO = Boolean(URI);

const DB_NAME = process.env.MONGODB_DB ?? "northwind_support";

/**
 * Cached across warm invocations, and across HMR reloads in dev — without the
 * globalThis cache, `next dev` would open a fresh pool on every file save.
 */
const globalForMongo = globalThis as unknown as {
  _northwindMongo?: Promise<MongoClient>;
};

function connect(): Promise<MongoClient> {
  const client = new MongoClient(URI!, {
    // Each serverless instance keeps its own pool. Two ops per request means
    // even a full room needs very few connections per instance.
    maxPoolSize: 5,
    // Nothing pre-warmed. Idle instances should hold no connections at all.
    minPoolSize: 0,
    // Fluid Compute reuses instances for a while, so 30s keeps a connection
    // alive across a burst without leaving it parked for an idle instance.
    maxIdleTimeMS: 30_000,
    // Fail fast. A rate limiter that hangs is worse than one that errors,
    // because the caller is waiting to find out whether it may spend money.
    connectTimeoutMS: 5_000,
    socketTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 5_000,
  });
  return client.connect();
}

export async function getDb(): Promise<Db> {
  if (!URI) throw new Error("MONGODB_URI is not set");
  globalForMongo._northwindMongo ??= connect();
  const client = await globalForMongo._northwindMongo;
  return client.db(DB_NAME);
}

/**
 * TTL index so expired buckets clean themselves up. Created once per warm
 * instance; createIndex is idempotent and cheap after the first call.
 */
let indexReady: Promise<void> | null = null;

export async function ensureIndexes(): Promise<void> {
  indexReady ??= (async () => {
    const db = await getDb();
    await db
      .collection("rate_limits")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl" });
  })();
  await indexReady;
}
