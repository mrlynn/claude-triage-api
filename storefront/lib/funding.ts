import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { cors } from "./assistant";
import { clientForKey, houseClient } from "./anthropicClient";
import { byokMode, byokSettings, type ByokMode } from "./byokConfig";
import { logCall, recordGate } from "./activity";
import { errorCode } from "./adminPolicy";
import { SURFACE_CEILINGS, estimateMicros, microsToUsd, type Surface, type UsageLike } from "./cost";
import { deleteKey, getKeyDoc, getUser, keyExpiry, lookupSession, type KeyDoc, type UserDoc } from "./identity";
import { adjustHouse, adjustTrial, forceReserveTrial, recordByokSpend, reserveHouse, reserveKey, reserveTrial } from "./ledger";
import { ensureIndexes, getDb, HAS_MONGO } from "./mongo";
import { checkLimits, clientIp, type LimitScope, type LimitVerdict } from "./ratelimit";
import { redactSecrets, unseal, type Sealed } from "./secrets";
import { recordFunding } from "./telemetry";

/**
 * Who pays for a call. Every route that calls Claude asks `guardAi` first and
 * tells `settle` what the call cost afterwards. See docs/byok/SPEC.md §6.
 *
 *   BYOK_MODE=off      the owner's key, the request-count limits, no ledger
 *   BYOK_MODE=shadow   sign-in and metering run, nobody is refused for credit
 *   BYOK_MODE=enforce  anonymous visitors sign in; exhausted learners bring a key
 *
 * THE ONE RULE THAT MUST NEVER BEND: a learner who brought a key is served by
 * that key or not at all. If Anthropic rejects it, the answer is an error that
 * says so — never a quiet retry on the owner's key, which would turn "my key is
 * broken" into "the site is free" for anyone who pastes garbage.
 */

/** What the model was asked and answered, accumulated by `noteUsage` for the call log. */
export interface CallTrace {
  model: string | null;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  stopReason: string | null;
}

export type Funding = {
  surface: Surface;
  scope: LimitScope;
  client: Anthropic;
  startedAt: number;
  trace: CallTrace;
  /** Set once `settle` has run, so a finally block and a catch cannot both settle. */
  settled?: boolean;
} & (
  | { kind: "house" }
  | {
      kind: "trial";
      userId: string;
      /** Everything reserved from the learner's credit so far: the gate's reservation plus any `reserveMore`. */
      reserved: number;
      /** Each reservation against the house budget, on the UTC day it was taken, so a refund lands on that day. */
      houseReserved: { day: string; micros: number }[];
    }
  | {
      kind: "byok";
      userId: string;
      sessionHash: string;
      /** Reserved on the key against the learner's own limit; settled to the real cost like the trial. */
      reserved: number;
    }
);

export type GateCode =
  | "rate_limited"
  | "sign_in_required"
  | "trial_exhausted"
  | "house_budget"
  | "key_invalid"
  | "key_quota"
  | "key_limit"
  | "unconfigured"
  | "store_error";

export interface Meter {
  mode: "trial" | "exhausted" | "byok";
  trial: { grantUsd: number; spentUsd: number; remainingUsd: number } | null;
  key: { last4: string; sessionSpentUsd: number; limitUsd: number | null; expiresAt: string } | null;
}

export interface Account {
  mode: "off" | "anon" | Meter["mode"];
  enforced: boolean;
  signedIn: boolean;
  login: string | null;
  trial: Meter["trial"];
  key: Meter["key"];
  /** Worst-case USD per call, so the page can say "about N more lessons". */
  estimates: Record<Surface, number>;
  /** Append `?returnTo=` and navigate there. */
  signInPath: string;
}

export class AiGateError extends Error {
  constructor(
    readonly code: GateCode,
    readonly status: number,
    readonly detail: string,
    readonly retryAfterSec?: number,
    readonly meter?: Meter | null,
  ) {
    super(code);
  }
}

const SIGN_IN_PATH = "/api/auth/github/start";

const DETAIL: Record<GateCode, string> = {
  rate_limited: "That is a lot of requests from your connection. Give it a few minutes.",
  sign_in_required: "Sign in with GitHub to use the AI features. It comes with free credit to try them.",
  trial_exhausted: "You have used your free credit. Add your own Anthropic API key to keep going.",
  house_budget: "Today's free credit for everyone has run out. It resets at midnight UTC, or add your own key now.",
  key_invalid: "Anthropic rejected your API key, so it has been removed. Add a working key to keep going.",
  key_quota: "Your Anthropic key was refused for this request.",
  key_limit: "This would go past the spending limit you set for your key. Raise the limit or remove it to keep going.",
  unconfigured: "The AI features are not configured on this deployment.",
  store_error: "We cannot check your credit right now, so nothing was spent. Try again shortly.",
};

const gate = (code: GateCode, status: number, extra: { retryAfterSec?: number; meter?: Meter | null; detail?: string } = {}) =>
  new AiGateError(code, status, extra.detail ?? DETAIL[code], extra.retryAfterSec, extra.meter);

function limitError(verdict: Exclude<LimitVerdict, { ok: true }>): AiGateError {
  if (verdict.reason === "unconfigured") return gate("unconfigured", 503);
  if (verdict.reason === "store_error") return gate("store_error", 503, { retryAfterSec: verdict.retryAfterSec });
  if (verdict.reason === "daily_cap") {
    return gate("rate_limited", 429, {
      retryAfterSec: verdict.retryAfterSec,
      detail: "This demo has hit its daily cap. It resets at midnight UTC.",
    });
  }
  return gate("rate_limited", 429, { retryAfterSec: verdict.retryAfterSec });
}

const secondsToUtcMidnight = () => {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((midnight - now.getTime()) / 1000));
};

/** "Exhausted" means not even the cheapest surface fits. */
const cheapestMicros = () => Math.min(...(Object.keys(SURFACE_CEILINGS) as Surface[]).map(estimateMicros));

export function meterFor(user: UserDoc | null, key: KeyDoc | null): Meter {
  const remaining = user ? Math.max(0, user.grantMicros - user.spentMicros) : 0;
  return {
    mode: key ? "byok" : remaining >= cheapestMicros() ? "trial" : "exhausted",
    trial: user
      ? {
          grantUsd: microsToUsd(user.grantMicros),
          spentUsd: microsToUsd(Math.min(user.spentMicros, user.grantMicros)),
          remainingUsd: microsToUsd(remaining),
        }
      : null,
    key: key
      ? {
          last4: key.last4,
          sessionSpentUsd: microsToUsd(key.sessionSpentMicros),
          limitUsd: typeof key.limitMicros === "number" ? microsToUsd(key.limitMicros) : null,
          expiresAt: key.expiresAt.toISOString(),
        }
      : null,
  };
}

const newTrace = (): CallTrace => ({
  model: null,
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  stopReason: null,
});

const base = (scope: LimitScope, surface: Surface) => ({ surface, scope, startedAt: Date.now(), trace: newTrace() });

const house = (scope: LimitScope, surface: Surface): Funding => ({ kind: "house", ...base(scope, surface), client: houseClient() });

/**
 * Tells the call log what a response used. Called wherever `costMicros` is,
 * with the same usage. `requests` is more than 1 only for the assistant, which
 * reports its whole agent loop at once.
 */
export function noteUsage(
  funding: Funding,
  response: { usage: UsageLike; model: string; stop_reason?: string | null },
  requests = 1,
): void {
  const t = funding.trace;
  t.model = response.model;
  t.requests += requests;
  t.inputTokens += response.usage.input_tokens;
  t.outputTokens += response.usage.output_tokens;
  t.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
  t.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
  if (response.stop_reason !== undefined) t.stopReason = response.stop_reason;
}

/**
 * Decides who pays for one call on `surface`, reserving credit if it is the
 * trial. Throws `AiGateError` when nobody will.
 */
export async function guardAi(request: Request, scope: LimitScope, surface: Surface): Promise<Funding> {
  try {
    return await decide(request, scope, surface);
  } catch (error) {
    if (error instanceof AiGateError) recordGate(error.code);
    throw error;
  }
}

async function decide(request: Request, scope: LimitScope, surface: Surface): Promise<Funding> {
  const mode: ByokMode = byokMode();
  const ip = clientIp(request.headers);

  if (mode === "off" || !HAS_MONGO) {
    // Without a database nothing can be metered, and the request-count limiter
    // already decides what that means: open in development, closed in production.
    const verdict = await checkLimits(ip, scope);
    if (!verdict.ok) throw limitError(verdict);
    return house(scope, surface);
  }

  const enforce = mode === "enforce";
  const settings = byokSettings();

  try {
    await ensureIndexes();
    const session = await lookupSession(request);

    const verdict = await checkLimits(ip, scope, {
      ipMultiplier: session ? settings.signedInIpMultiplier : 1,
      // Under enforcement the dollar budget below replaces the request count.
      daily: !enforce,
    });
    if (!verdict.ok) throw limitError(verdict);

    if (!session) {
      if (enforce) throw gate("sign_in_required", 401);
      return house(scope, surface);
    }

    const keyDoc = await getKeyDoc(session.sessionHash);
    if (keyDoc) {
      const apiKey = unseal(keyDoc, session.sessionHash);
      if (apiKey) {
        const est = estimateMicros(surface);
        const reservedKey = await reserveKey(session.sessionHash, est);
        if (!reservedKey) {
          const [current, user] = await Promise.all([getKeyDoc(session.sessionHash), getUser(session.userId)]);
          if (current) throw gate("key_limit", 402, { meter: meterFor(user, current) });
          // Removed between the two reads, from another tab: fall through to the trial.
        } else {
          return {
            kind: "byok",
            ...base(scope, surface),
            client: clientForKey(apiKey),
            userId: session.userId,
            sessionHash: session.sessionHash,
            reserved: est,
          };
        }
      } else {
        // Sealed under a master key that has since been rotated away, or
        // tampered with. Either way it is not usable, and keeping it is not kind.
        await deleteKey(session.sessionHash);
      }
    }

    const est = estimateMicros(surface);
    const user = enforce ? await reserveTrial(session.userId, est) : await forceReserveTrial(session.userId, est);
    if (!user) {
      const current = await getUser(session.userId);
      // A session outliving its user (the user TTL is far longer, but a manual
      // delete is possible) is a sign-in problem, not a credit problem.
      if (!current) throw gate("sign_in_required", 401);
      throw gate("trial_exhausted", 402, { meter: meterFor(current, null) });
    }

    const houseDay = await reserveHouse(est);
    if (!houseDay && enforce) {
      await adjustTrial(session.userId, -est);
      throw gate("house_budget", 503, { retryAfterSec: secondsToUtcMidnight(), meter: meterFor(user, null) });
    }
    return {
      kind: "trial",
      ...base(scope, surface),
      client: houseClient(),
      userId: session.userId,
      reserved: est,
      houseReserved: houseDay ? [{ day: houseDay, micros: est }] : [],
    };
  } catch (error) {
    if (error instanceof AiGateError) throw error;
    // The same stance as the limiter: if credit cannot be checked, nothing is spent.
    console.error("funding check failed", redactSecrets(error));
    if (process.env.NODE_ENV === "development") return house(scope, surface);
    throw gate("store_error", 503, { retryAfterSec: 60 });
  }
}

/**
 * Reserves credit for one more request on the same surface, for a call that
 * decides mid-way to try again — a Tutor lesson whose first draft lost a
 * planted mistake. Reserving every possible attempt up front would refuse a
 * lesson to anyone who could afford the one draft most lessons need.
 *
 * True when the retry may run. False when the credit or the house budget
 * cannot cover it, or when credit cannot be checked: the caller keeps what it
 * already has rather than spending what nobody reserved. On a learner's own
 * key it reserves against the limit they set, if any. Always true for
 * unmetered calls, which have nothing to reserve.
 */
export async function reserveMore(funding: Funding): Promise<boolean> {
  if (funding.settled) return false;
  if (funding.kind === "house") return true;
  if (funding.kind === "byok") {
    const est = estimateMicros(funding.surface);
    try {
      if (!(await reserveKey(funding.sessionHash, est))) return false;
      funding.reserved += est;
      return true;
    } catch (error) {
      console.error("reserving a retry failed; skipping it", redactSecrets(error));
      return false;
    }
  }
  const enforce = byokMode() === "enforce";
  const est = estimateMicros(funding.surface);
  try {
    const user = enforce ? await reserveTrial(funding.userId, est) : await forceReserveTrial(funding.userId, est);
    if (!user) return false;
    const houseDay = await reserveHouse(est);
    if (!houseDay && enforce) {
      await adjustTrial(funding.userId, -est);
      return false;
    }
    funding.reserved += est;
    if (houseDay) funding.houseReserved.push({ day: houseDay, micros: est });
    return true;
  } catch (error) {
    console.error("reserving a retry failed; skipping it", redactSecrets(error));
    return false;
  }
}

/**
 * Settles the house budget: the whole cost lands on the latest day reserved,
 * and every reservation is given back on the day it was taken. Almost always
 * that is one day and one update.
 */
async function settleHouse(reserved: { day: string; micros: number }[], spentMicros: number): Promise<void> {
  if (reserved.length === 0) return;
  const byDay = new Map<string, number>();
  for (const r of reserved) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.micros);
  const lastDay = reserved.at(-1)!.day;
  await Promise.all(
    [...byDay].map(([day, micros]) => adjustHouse(day, (day === lastDay ? spentMicros : 0) - micros)),
  );
}

/**
 * Records what a call actually cost and returns the learner's updated meter.
 * `spentMicros` is 0 for a call that never reached billing, which refunds the
 * whole reservation. Never throws: by the time this runs the visitor's answer
 * exists, and accounting must not be what loses it.
 *
 * `error` is whatever failed, if anything; only `errorCode(error)` is kept.
 * Latency is from the gate to here, so it includes the funding check itself —
 * which is what the learner waited for.
 */
export async function settle(funding: Funding, spentMicros: number, error?: unknown): Promise<Meter | null> {
  if (funding.settled) return null;
  funding.settled = true;
  logCall({
    surface: funding.surface,
    scope: funding.scope,
    funding: funding.kind,
    userId: funding.kind === "house" ? null : funding.userId,
    ...funding.trace,
    costMicros: spentMicros,
    latencyMs: Date.now() - funding.startedAt,
    error: error === undefined ? null : errorCode(error),
  });
  try {
    recordFunding(funding.kind, spentMicros);
    if (funding.kind === "house") return null;
    if (funding.kind === "trial") {
      const [user] = await Promise.all([
        adjustTrial(funding.userId, spentMicros - funding.reserved),
        settleHouse(funding.houseReserved, spentMicros),
      ]);
      return meterFor(user, null);
    }
    const { key, user } = await recordByokSpend(funding.sessionHash, funding.userId, spentMicros, funding.reserved);
    return meterFor(user, key);
  } catch (error) {
    console.error("settling a call failed (ignored)", redactSecrets(error));
    return null;
  }
}

/**
 * Turns an upstream error on a learner's own key into something they can act
 * on. Null for anything else, including every error on the owner's key —
 * those are the route's existing failure handling, unchanged.
 */
export async function keyError(funding: Funding, error: unknown): Promise<AiGateError | null> {
  // By shape rather than `instanceof APIError`: a bundler can end up with two
  // copies of the SDK, and a failed instanceof here would silently skip the
  // one check that stops a revoked key from being retried forever.
  const status = (error as { status?: unknown } | null)?.status;
  if (funding.kind !== "byok" || typeof status !== "number" || !(error instanceof Error)) return null;
  const upstream = redactSecrets(error.message).slice(0, 300);
  if (status === 401) {
    await deleteKey(funding.sessionHash).catch(() => undefined);
    return gate("key_invalid", 402);
  }
  if (status === 403 || status === 429 || (status === 400 && /credit|billing|balance/i.test(error.message))) {
    return gate("key_quota", 402, { detail: `${DETAIL.key_quota} Anthropic said: ${upstream}` });
  }
  return null;
}

export function gateBody(error: AiGateError) {
  return {
    error: error.code,
    detail: error.detail,
    ...(error.retryAfterSec ? { retryAfterSec: error.retryAfterSec } : {}),
    ...(error.code === "sign_in_required" ? { signInPath: SIGN_IN_PATH } : {}),
    ...(error.meter ? { meter: error.meter } : {}),
  };
}

export function gateResponse(request: Request, error: AiGateError): Response {
  return cors(
    request,
    Response.json(gateBody(error), {
      status: error.status,
      headers: error.retryAfterSec ? { "Retry-After": String(error.retryAfterSec) } : undefined,
    }),
  );
}

export async function accountFor(request: Request): Promise<Account> {
  const estimates = Object.fromEntries(
    (Object.keys(SURFACE_CEILINGS) as Surface[]).map((s) => [s, microsToUsd(estimateMicros(s))]),
  ) as Record<Surface, number>;
  const base = { estimates, signInPath: SIGN_IN_PATH, trial: null, key: null, login: null, signedIn: false };
  const mode = byokMode();
  if (mode === "off" || !HAS_MONGO) return { ...base, mode: "off", enforced: false };

  const enforced = mode === "enforce";
  await ensureIndexes();
  const session = await lookupSession(request);
  if (!session) return { ...base, mode: "anon", enforced };
  const [user, key] = await Promise.all([getUser(session.userId), getKeyDoc(session.sessionHash)]);
  if (!user) return { ...base, mode: "anon", enforced };
  const meter = meterFor(user, key);
  return { ...base, ...meter, enforced, signedIn: true, login: user.login };
}

/**
 * Changes the limit on a stored key. A limit below what the key has already
 * spent is allowed: it simply stops further calls, which is what someone
 * lowering their limit wants. Null when there is no key to change.
 */
export async function setKeyLimit(sessionHash: string, limitMicros: number | null): Promise<KeyDoc | null> {
  const db = await getDb();
  return db
    .collection<KeyDoc>("byok_keys")
    .findOneAndUpdate({ _id: sessionHash }, { $set: { limitMicros } }, { returnDocument: "after" });
}

/** Store a verified key, sealed to this session, with the learner's own spending limit (null for none). */
export async function storeKey(
  sessionHash: string,
  userId: string,
  sealed: Sealed,
  last4: string,
  limitMicros: number | null = null,
): Promise<void> {
  const db = await getDb();
  await db.collection<KeyDoc>("byok_keys").updateOne(
    { _id: sessionHash },
    {
      $set: { userId, ...sealed, last4, limitMicros, verifiedAt: new Date(), expiresAt: keyExpiry() },
      $setOnInsert: { sessionSpentMicros: 0 },
    },
    { upsert: true },
  );
}
