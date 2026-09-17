import "server-only";
import { getDb, ensureIndexes, HAS_MONGO } from "./mongo";

/**
 * Abuse and spend control for the public support form.
 *
 * A public form that calls a frontier model on your key is an uncapped bill.
 * This URL will end up in a repo, in slides, and in a room full of people, so
 * there are three independent limits — any one of them can be wrong:
 *
 *   1. Per-IP fixed window. Stops casual scripting.
 *   2. Global daily cap. Stops a distributed script, and stops one
 *      enthusiastic room from spending a month's budget in an afternoon.
 *   3. A hard max_tokens and input length cap in triage.ts, which bounds the
 *      cost of any single call regardless of the two above.
 *
 * Both counters are a single atomic `$inc` upsert against an indexed `_id`,
 * with a TTL field so buckets expire on their own and nothing needs sweeping.
 * A fixed window rather than a sliding one: it is one round trip instead of a
 * sorted-set read-modify-write, and the difference does not matter at a
 * ceiling of five requests per ten minutes.
 *
 * Without a database the limiter fails CLOSED in production. A missing store
 * must not silently remove the spend ceiling.
 */

const IP_WINDOW_MS = 10 * 60 * 1000;

/**
 * Independent ceilings per surface.
 *
 * The support form and the injection playground both spend real money on the
 * same key, but they must not share a per-IP window: someone working through
 * the playground would otherwise burn the allowance for filing an actual
 * support ticket, which is the one thing on this site that has to work.
 *
 * They DO share the global daily cap, and that is deliberate — the daily cap
 * protects the bill, and the bill does not care which page spent it. The one
 * exception is `queue`, which spends nothing and so does not count against it.
 */
const SCOPES = {
  support: Number(process.env.SUPPORT_IP_LIMIT ?? 5),
  injection: Number(process.env.INJECTION_IP_LIMIT ?? 8),
  // Ask Northwind, on its own window. A conversation is several model calls
  // rather than one, and it can now put a row on a public board, so it needs a
  // budget of its own — and must not be able to exhaust the support form's.
  assistant: Number(process.env.ASSISTANT_IP_LIMIT ?? 12),
  // The as-you-type preview. A higher ceiling than any other paid surface
  // because ONE message legitimately costs several calls — the debounce fires
  // whenever you pause, and a person writing a paragraph pauses. The budget
  // that makes that safe is not the request count, it is the model: a Haiku
  // preview against a cached prefix is roughly a fiftieth of a triage call, so
  // forty of them cost less than two submitted tickets.
  live: Number(process.env.LIVE_IP_LIMIT ?? 40),
  // The Tutor. A session is roughly four calls — a lesson, a review or two, and
  // a plan once per cram — plus at most three hints, which run at low effort
  // and a small max_tokens. Twenty per window is still a learner working steadily,
  // not a script. Its own window, because someone cramming for an afternoon
  // must not be the reason the support form says "busy".
  tutor: Number(process.env.TUTOR_IP_LIMIT ?? 20),
  // Token probing, not spending. A higher ceiling than the paid surfaces
  // because a facilitator refreshing the board during a session is normal
  // traffic — the point is a floor under brute force, not a tight budget.
  queue: Number(process.env.QUEUE_IP_LIMIT ?? 60),
  // Adding an Anthropic key. Tight, because each attempt is a round trip to
  // Anthropic that says whether a key is valid — a route with no ceiling here
  // is a free key-checking oracle.
  key: Number(process.env.KEY_IP_LIMIT ?? 10),
  // Feedback. Spends nothing, so no daily cap; the window is a floor under a
  // script filling the admin console, generous enough for a reader rating
  // every page of a lab and then adding comments.
  feedback: Number(process.env.FEEDBACK_IP_LIMIT ?? 30),
  // The Messages API explorer. Each send is one call a developer chose to make and then reads for a while, so the
  // window is closer to the injection playground than to the as-you-type preview.
  explorer: Number(process.env.EXPLORER_IP_LIMIT ?? 20),
  // The explorer's token-count preflight. count_tokens is free, so no daily cap; the window is a floor under a script.
  count: Number(process.env.COUNT_IP_LIMIT ?? 40),
} as const;

export type LimitScope = keyof typeof SCOPES;

/** The scopes that call a model, and so share the global daily cap. */
const PAID_SCOPES: ReadonlySet<LimitScope> = new Set(["support", "injection", "assistant", "live", "tutor", "explorer"]);

const DAILY_CAP = Number(process.env.SUPPORT_DAILY_CAP ?? 600);

export type LimitVerdict =
  | { ok: true; remaining: number }
  | {
      ok: false;
      reason: "per_ip" | "daily_cap" | "unconfigured" | "store_error";
      retryAfterSec: number;
    };

interface Bucket {
  _id: string;
  count: number;
  expiresAt: Date;
}

/** One atomic increment. Returns the post-increment count. */
export async function bump(id: string, ttlMs: number): Promise<number> {
  const db = await getDb();
  const result = await db.collection<Bucket>("rate_limits").findOneAndUpdate(
    { _id: id },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(Date.now() + ttlMs) },
    },
    { upsert: true, returnDocument: "after", projection: { count: 1 } },
  );
  return result?.count ?? 1;
}

export async function checkLimits(
  ip: string,
  scope: LimitScope = "support",
  {
    ipMultiplier = 1,
    daily = PAID_SCOPES.has(scope),
  }: {
    /** Signed-in visitors share conference NAT IPs; they get a wider window. */
    ipMultiplier?: number;
    /**
     * Whether this call counts against the global request cap. Once trial
     * spend is metered in dollars (BYOK_MODE=enforce), the dollar budget in
     * `ledger.ts` replaces it and the caller passes false.
     */
    daily?: boolean;
  } = {},
): Promise<LimitVerdict> {
  const ipLimit = Math.floor(SCOPES[scope] * ipMultiplier);

  if (!HAS_MONGO) {
    // Local development without a cluster stays usable; production does not.
    return process.env.NODE_ENV === "development"
      ? { ok: true, remaining: ipLimit }
      : { ok: false, reason: "unconfigured", retryAfterSec: 3600 };
  }

  try {
    await ensureIndexes();

    // Fixed window: the bucket id carries the window, so an expired window is
    // simply a different document.
    const window = Math.floor(Date.now() / IP_WINDOW_MS);
    // The scope is part of the bucket id, so surfaces cannot starve each other.
    const ipCount = await bump(`${scope}:ip:${ip}:${window}`, IP_WINDOW_MS * 2);
    if (ipCount > ipLimit) {
      const windowEnds = (window + 1) * IP_WINDOW_MS;
      return {
        ok: false,
        reason: "per_ip",
        retryAfterSec: Math.max(1, Math.ceil((windowEnds - Date.now()) / 1000)),
      };
    }

    // Only surfaces that spend count against the daily cap. The queue calls no
    // model, and a facilitator refreshing the board all afternoon must not be
    // the reason the support form says "busy" at 4pm.
    if (!daily) return { ok: true, remaining: Math.max(0, ipLimit - ipCount) };

    const day = new Date().toISOString().slice(0, 10);
    const dayCount = await bump(`day:${day}`, 26 * 60 * 60 * 1000);
    if (dayCount > DAILY_CAP) {
      return { ok: false, reason: "daily_cap", retryAfterSec: 3600 };
    }

    return { ok: true, remaining: Math.max(0, DAILY_CAP - dayCount) };
  } catch (err) {
    // If the ceiling cannot be enforced, do not spend. Failing closed on a
    // demo form is a minor annoyance; failing open is a bill.
    console.error("rate limit store unavailable", err);
    return { ok: false, reason: "store_error", retryAfterSec: 120 };
  }
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
