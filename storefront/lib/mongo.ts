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
 * Indexes, created once per warm instance. `createIndex` is idempotent and
 * cheap after the first call, so this runs on the request path rather than in
 * a migration step — appropriate for a demo with two collections, and the
 * first thing to move if this ever became real.
 */
let indexReady: Promise<void> | null = null;

/** Escalations are deleted this long after arrival. Enforced by the database. */
const ESCALATION_RETENTION_DAYS = 30;

export async function ensureIndexes(): Promise<void> {
  indexReady ??= (async () => {
    const db = await getDb();
    await Promise.all([
      db
        .collection("rate_limits")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl" }),

      // The reviewer board reads by status, newest first.
      db
        .collection("escalations")
        .createIndex({ status: 1, created_at: -1 }, { name: "board" }),

      // Retention as an index, not as a promise in a README. A public demo
      // that accumulates the public's support messages indefinitely is a
      // liability that grows by itself, and the only version of a retention
      // policy that survives contact with a busy team is one the database
      // enforces without being asked.
      db.collection("escalations").createIndex(
        { created_at: 1 },
        {
          expireAfterSeconds: ESCALATION_RETENTION_DAYS * 24 * 60 * 60,
          name: "retention",
        },
      ),
    ]);
  })();
  await indexReady;
}
