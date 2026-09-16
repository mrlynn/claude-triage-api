import "server-only";
import { getDb, ensureIndexes, HAS_MONGO } from "./mongo";
import type { Micros } from "./cost";

/**
 * Usage and cost telemetry for the storefront's Claude calls.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: store a row per request. A per-call log
 * is the obvious design and it is the wrong one here — it grows without bound,
 * it needs its own retention policy, and it would hold a timestamped trail of
 * what individual visitors submitted, which is precisely the kind of data this
 * app has spent two labs arguing you should not accumulate just because you
 * have somewhere to put it.
 *
 * So: one document per UTC day, updated with a single atomic `$inc` — the same
 * pattern `ratelimit.ts` already uses. Counters only. There is no way to
 * reconstruct an individual request from this, which is the property that
 * makes it safe to keep.
 *
 * FOR SIGNED-IN LEARNERS THERE IS NOW A ROW PER CALL, in `activity.ts`: metadata
 * only, 90-day TTL, read by the owner's /admin console (Decision 13). These
 * counters stay what /ops reads, and still cover anonymous traffic whose calls
 * carry no identity.
 *
 * WHY THIS EXISTS AT ALL, given /ops already had numbers: those were measured
 * once and checked into `opsData.ts`. This is the same accounting over real
 * traffic — Lab 5's subject at the scale where it starts to matter, and the
 * only place in the whole asset where cost is observed rather than computed
 * from a sample.
 *
 * NOTE the API service in `src/` is not instrumented and will not be. It runs
 * on learners' laptops, so there is nothing central to measure — and adding
 * phone-home to a repo people fork and read would undercut the trust-boundary
 * lab it ships with.
 */

/**
 * Which page spent it. Coarser than `cost.ts`'s surfaces on purpose: the
 * owner's question is "where does the money go", and four Tutor calls are one
 * answer to it.
 */
export type SpendSurface = "support" | "injection" | "live" | "tutor" | "assistant";

interface DayDoc {
  _id: string; // YYYY-MM-DD
  calls: number;
  cache_hits: number;
  escalated: number;
  blocked: number;
  cost_micros: Micros;
  /** Per-category counters, keyed by the triage enum. */
  category: Record<string, number>;
  /**
   * Calls and spend per surface, for EVERY paid surface. The top-level
   * counters above stay what /ops has always shown — submitted tickets and
   * assistant runs — so forty previews of one draft do not read as forty
   * tickets or drag down the mean cost per call.
   */
  surface?: Partial<Record<SpendSurface, { calls: number; cost_micros: Micros }>>;
  /** Calls and spend by who paid. See `recordFunding`. */
  funding?: Partial<Record<"house" | "trial" | "byok", { calls: number; cost_micros: Micros }>>;
  expiresAt: Date;
}

const COLLECTION = "usage_daily";

/** Long enough to show a trend, short enough to be forgettable. */
const RETENTION_DAYS = 90;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Records one classified request. Fire-and-forget by design.
 *
 * Telemetry must never be able to fail a customer's request: if the counter
 * write throws, the classification has already succeeded and the visitor does
 * not care. Callers do not await this, and it swallows its own errors.
 */
export function recordCall(input: {
  surface: "support" | "assistant";
  category: string;
  cacheHit: boolean;
  escalated: boolean;
  costMicros: Micros;
}): void {
  if (!HAS_MONGO) return;
  void (async () => {
    try {
      await ensureIndexes();
      const db = await getDb();
      await db.collection<DayDoc>(COLLECTION).updateOne(
        { _id: today() },
        {
          $inc: {
            calls: 1,
            cache_hits: input.cacheHit ? 1 : 0,
            escalated: input.escalated ? 1 : 0,
            cost_micros: input.costMicros,
            [`category.${input.category}`]: 1,
            [`surface.${input.surface}.calls`]: 1,
            [`surface.${input.surface}.cost_micros`]: input.costMicros,
          },
          $setOnInsert: {
            expiresAt: new Date(Date.now() + RETENTION_DAYS * 86_400_000),
          },
        },
        { upsert: true },
      );
    } catch (err) {
      console.error("telemetry write failed (ignored)", err);
    }
  })();
}

/**
 * Spend on a surface that is not a ticket: the live preview, the injection
 * playground, the Tutor. Same fire-and-forget contract as `recordCall`, but it
 * touches only the per-surface counters.
 */
export function recordSpend(surface: SpendSurface, costMicros: Micros): void {
  if (!HAS_MONGO) return;
  void (async () => {
    try {
      await ensureIndexes();
      const db = await getDb();
      await db.collection<DayDoc>(COLLECTION).updateOne(
        { _id: today() },
        {
          $inc: {
            [`surface.${surface}.calls`]: 1,
            [`surface.${surface}.cost_micros`]: costMicros,
          },
          $setOnInsert: {
            expiresAt: new Date(Date.now() + RETENTION_DAYS * 86_400_000),
          },
        },
        { upsert: true },
      );
    } catch (err) {
      console.error("telemetry write failed (ignored)", err);
    }
  })();
}

/**
 * Who paid, for the owner's view of what the trial costs. `house` is spend on
 * the owner's key with no ledger at all (BYOK_MODE=off, or an anonymous
 * visitor in shadow mode); `trial` is the owner's key against a learner's
 * credit; `byok` is the learner's own key.
 */
export function recordFunding(funding: "house" | "trial" | "byok", costMicros: Micros): void {
  if (!HAS_MONGO) return;
  void (async () => {
    try {
      await ensureIndexes();
      const db = await getDb();
      await db.collection<DayDoc>(COLLECTION).updateOne(
        { _id: today() },
        {
          $inc: { [`funding.${funding}.calls`]: 1, [`funding.${funding}.cost_micros`]: costMicros },
          $setOnInsert: { expiresAt: new Date(Date.now() + RETENTION_DAYS * 86_400_000) },
        },
        { upsert: true },
      );
    } catch (err) {
      console.error("telemetry write failed (ignored)", err);
    }
  })();
}

/** A request that never reached the model, so it has no cost or category. */
export function recordBlocked(): void {
  if (!HAS_MONGO) return;
  void (async () => {
    try {
      await ensureIndexes();
      const db = await getDb();
      await db.collection<DayDoc>(COLLECTION).updateOne(
        { _id: today() },
        {
          $inc: { blocked: 1 },
          $setOnInsert: {
            expiresAt: new Date(Date.now() + RETENTION_DAYS * 86_400_000),
          },
        },
        { upsert: true },
      );
    } catch (err) {
      console.error("telemetry write failed (ignored)", err);
    }
  })();
}

export interface UsageSummary {
  days: number;
  calls: number;
  blocked: number;
  escalated: number;
  cacheHitRate: number | null;
  costUsd: number;
  /** Mean cost of a call that actually reached the model. */
  costPerCallUsd: number | null;
  categories: { name: string; count: number }[];
  /** Every paid surface, dearest first. Empty for days recorded before surfaces were counted. */
  surfaces: { name: SpendSurface; calls: number; costUsd: number }[];
  /** Newest last, for a sparkline. */
  daily: { date: string; calls: number; costUsd: number }[];
}

export async function usageSummary(days = 30): Promise<UsageSummary | null> {
  if (!HAS_MONGO) return null;

  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const db = await getDb();
  const rows = await db
    .collection<DayDoc>(COLLECTION)
    .find({ _id: { $gte: since } })
    .sort({ _id: 1 })
    .toArray();

  const sum = (f: (d: DayDoc) => number) => rows.reduce((a, d) => a + (f(d) || 0), 0);
  const calls = sum((d) => d.calls);
  const costUsd = sum((d) => d.cost_micros) / 1_000_000;

  const catTotals = new Map<string, number>();
  for (const row of rows) {
    for (const [name, n] of Object.entries(row.category ?? {})) {
      catTotals.set(name, (catTotals.get(name) ?? 0) + n);
    }
  }

  const surfaceTotals = new Map<SpendSurface, { calls: number; cost_micros: Micros }>();
  for (const row of rows) {
    for (const [name, v] of Object.entries(row.surface ?? {}) as [SpendSurface, { calls: number; cost_micros: Micros }][]) {
      const t = surfaceTotals.get(name) ?? { calls: 0, cost_micros: 0 };
      surfaceTotals.set(name, { calls: t.calls + (v.calls ?? 0), cost_micros: t.cost_micros + (v.cost_micros ?? 0) });
    }
  }

  return {
    days,
    calls,
    blocked: sum((d) => d.blocked),
    escalated: sum((d) => d.escalated),
    // Null rather than 0 when nothing has run: a rate with no denominator is
    // not zero, it is unknown, and "0%" on a dashboard reads as a broken cache.
    cacheHitRate: calls > 0 ? sum((d) => d.cache_hits) / calls : null,
    costUsd,
    costPerCallUsd: calls > 0 ? costUsd / calls : null,
    categories: [...catTotals.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    surfaces: [...surfaceTotals.entries()]
      .map(([name, t]) => ({ name, calls: t.calls, costUsd: t.cost_micros / 1_000_000 }))
      .sort((a, b) => b.costUsd - a.costUsd),
    daily: rows.map((d) => ({
      date: d._id,
      calls: d.calls ?? 0,
      costUsd: (d.cost_micros ?? 0) / 1_000_000,
    })),
  };
}
