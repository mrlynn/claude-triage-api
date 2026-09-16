import "server-only";
import type { Surface, Micros } from "./cost";
import type { LimitScope } from "./ratelimit";
import type { ReviewRecord } from "./adminPolicy";
import { ensureIndexes, getDb, HAS_MONGO } from "./mongo";

/**
 * What the owner's admin console reads: one row per AI call, one row per Tutor
 * review, and a daily count of refusals. Decision 13 in docs/architecture.md.
 *
 * THIS REVERSES A STANCE, so the terms are narrow. `telemetry.ts` argued for
 * counters only, and for an anonymous demo that is still right. Once people
 * sign in and spend credit, "who is spending it, on what, and is it working"
 * is a question the owner has to be able to answer — and a daily counter
 * cannot say which learner, which model, or how slow. So:
 *
 *   - METADATA ONLY. Surface, model, token counts, cost, latency, an error
 *     code. Never a prompt, a reply, an error message, or an IP address.
 *     There is no field a message could be written into.
 *   - EXPIRES. Both collections carry a TTL (`CALL_RETENTION_DAYS`), set per
 *     document, deleted by the database.
 *   - SAID. The privacy page lists both, in the same commit that added them.
 *
 * Every write is fire-and-forget, like the counters: a log that can fail a
 * learner's request is worse than no log.
 */

export const CALL_RETENTION_DAYS = 90;
const expiry = () => new Date(Date.now() + CALL_RETENTION_DAYS * 86_400_000);

export type FundingKind = "house" | "trial" | "byok";

export interface CallDoc {
  at: Date;
  surface: Surface;
  scope: LimitScope;
  funding: FundingKind;
  /** Null for an anonymous visitor on the house key. */
  userId: string | null;
  /** The model that answered (Decision 9). Null when no request reached it. */
  model: string | null;
  /** Model requests in the call: 1, or up to the agent loop's cap for the assistant. */
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: Micros;
  latencyMs: number;
  stopReason: string | null;
  /** Null when the call succeeded. A short code from `errorCode`, never a message. */
  error: string | null;
  expiresAt: Date;
}

export interface ReviewDoc extends ReviewRecord {
  at: Date;
  userId: string | null;
  expiresAt: Date;
}

export function logCall(doc: Omit<CallDoc, "at" | "expiresAt">): void {
  if (!HAS_MONGO) return;
  void (async () => {
    try {
      await ensureIndexes();
      const db = await getDb();
      await db.collection<CallDoc>("ai_calls").insertOne({ ...doc, at: new Date(), expiresAt: expiry() });
    } catch (err) {
      console.error("call log write failed (ignored)", err);
    }
  })();
}

export function logReview(userId: string | null, record: ReviewRecord): void {
  if (!HAS_MONGO) return;
  void (async () => {
    try {
      await ensureIndexes();
      const db = await getDb();
      await db
        .collection<ReviewDoc>("tutor_reviews")
        .insertOne({ ...record, userId, at: new Date(), expiresAt: expiry() });
    } catch (err) {
      console.error("review log write failed (ignored)", err);
    }
  })();
}

/**
 * A refusal from the funding gate, counted per day by code. No row per
 * refusal: the question is "how often do people hit the wall", and an
 * anonymous refusal has nobody to attribute it to anyway.
 */
export function recordGate(code: string): void {
  if (!HAS_MONGO) return;
  void (async () => {
    try {
      await ensureIndexes();
      const db = await getDb();
      await db.collection("usage_daily").updateOne(
        { _id: new Date().toISOString().slice(0, 10) } as never,
        { $inc: { [`gate.${code}`]: 1 }, $setOnInsert: { expiresAt: expiry() } },
        { upsert: true },
      );
    } catch (err) {
      console.error("gate counter write failed (ignored)", err);
    }
  })();
}
