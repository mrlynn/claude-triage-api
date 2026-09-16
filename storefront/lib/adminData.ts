import "server-only";
import type { Document } from "mongodb";
import type { CallDoc, ReviewDoc } from "./activity";
import { byokSettings } from "./byokConfig";
import type { FeedbackDoc } from "./feedback";
import { FEEDBACK_SURFACES, type FeedbackSurface } from "./feedbackPolicy";
import type { KeyDoc, SessionDoc, UserDoc } from "./identity";
import { ensureIndexes, getDb } from "./mongo";
import { CORPUS_INDEX, mistakeLab } from "./tutor";

/**
 * Every query the admin console runs. Read-only, and only ever called after
 * `requireAdmin()`.
 *
 * Aggregation runs in the database, not here: a 90-day window of calls is
 * the kind of thing that fits in an M0's memory as a `$group` and does not fit
 * in a serverless function's as an array. Latency percentiles use
 * `$percentile` (MongoDB 7+) for the same reason.
 *
 * Money stays in integer micro-dollars until the page formats it.
 */

export const WINDOWS = [1, 7, 30, 90] as const;
export type WindowDays = (typeof WINDOWS)[number];

export function parseWindow(raw: string | string[] | undefined): WindowDays {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return (WINDOWS as readonly number[]).includes(n) ? (n as WindowDays) : 30;
}

const sinceDate = (days: number) => new Date(Date.now() - days * 86_400_000);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

async function db() {
  await ensureIndexes();
  return getDb();
}

// ---- shared pipeline pieces ---------------------------------------------------------

const isError = { $cond: [{ $ne: ["$error", null] }, 1, 0] };

/** The accumulators every "how did these calls go" table wants. */
const callStats = {
  calls: { $sum: 1 },
  requests: { $sum: "$requests" },
  costMicros: { $sum: "$costMicros" },
  errors: { $sum: isError },
  inputTokens: { $sum: "$inputTokens" },
  outputTokens: { $sum: "$outputTokens" },
  cacheReadTokens: { $sum: "$cacheReadTokens" },
  cacheWriteTokens: { $sum: "$cacheWriteTokens" },
  latency: { $percentile: { input: "$latencyMs", p: [0.5, 0.95], method: "approximate" } },
};

export interface CallStats {
  calls: number;
  requests: number;
  costMicros: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

const EMPTY_STATS: CallStats = {
  calls: 0,
  requests: 0,
  costMicros: 0,
  errors: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  p50Ms: null,
  p95Ms: null,
};

function stats(row: Document | undefined): CallStats {
  if (!row) return EMPTY_STATS;
  const [p50, p95] = (row.latency as number[] | undefined) ?? [];
  return {
    calls: row.calls ?? 0,
    requests: row.requests ?? 0,
    costMicros: row.costMicros ?? 0,
    errors: row.errors ?? 0,
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    cacheReadTokens: row.cacheReadTokens ?? 0,
    cacheWriteTokens: row.cacheWriteTokens ?? 0,
    p50Ms: p50 ?? null,
    p95Ms: p95 ?? null,
  };
}

/** Logins for a set of user ids. Users expire; a missing one reads as its id. */
async function loginsFor(ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  const rows = await (await db())
    .collection<UserDoc>("users")
    .find({ _id: { $in: wanted } }, { projection: { login: 1 } })
    .toArray();
  return new Map(rows.map((u) => [u._id, u.login]));
}

/** Every day in the window, oldest first, so a quiet day is a zero and not a gap. */
function fillDays<T>(days: number, rows: Map<string, T>, empty: () => T): { date: string; value: T }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = dayKey(new Date(Date.now() - (days - 1 - i) * 86_400_000));
    return { date, value: rows.get(date) ?? empty() };
  });
}

// ---- overview -------------------------------------------------------------------------

export interface Overview {
  days: WindowDays;
  /** When the call log starts. Anything earlier is only in `usage_daily`. */
  loggingSince: string | null;
  totals: CallStats & { activeUsers: number; anonymousCalls: number };
  funding: { kind: string; calls: number; costMicros: number }[];
  surfaces: { surface: string; calls: number; costMicros: number }[];
  daily: { date: string; calls: number; costMicros: number; errors: number; users: number }[];
  users: { total: number; new: number; seen: number; grantMicros: number; spentMicros: number; byokSpentMicros: number };
  gates: { code: string; count: number }[];
  live: {
    sessions: number;
    signedInUsers: number;
    keys: number;
    houseSpentMicros: number;
    houseBudgetMicros: number;
    grantsToday: number;
    grantsDaily: number;
  };
}

export async function overview(days: WindowDays): Promise<Overview> {
  const d = await db();
  const since = sinceDate(days);
  const now = new Date();
  const calls = d.collection<CallDoc>("ai_calls");
  const settings = byokSettings();
  const today = dayKey(now);

  const [facet, first, userAgg, gateRows, sessionUsers, sessions, keys, houseDoc, grantsDoc] = await Promise.all([
    calls
      .aggregate([
        { $match: { at: { $gte: since } } },
        {
          $facet: {
            totals: [{ $group: { _id: null, ...callStats, anonymous: { $sum: { $cond: [{ $eq: ["$userId", null] }, 1, 0] } } } }],
            users: [{ $match: { userId: { $ne: null } } }, { $group: { _id: "$userId" } }, { $count: "n" }],
            funding: [{ $group: { _id: "$funding", calls: { $sum: 1 }, costMicros: { $sum: "$costMicros" } } }, { $sort: { costMicros: -1 } }],
            surfaces: [{ $group: { _id: "$surface", calls: { $sum: 1 }, costMicros: { $sum: "$costMicros" } } }, { $sort: { costMicros: -1 } }],
            daily: [
              { $set: { day: { $dateToString: { format: "%Y-%m-%d", date: "$at" } } } },
              {
                $group: {
                  _id: { day: "$day", user: "$userId" },
                  calls: { $sum: 1 },
                  costMicros: { $sum: "$costMicros" },
                  errors: { $sum: isError },
                },
              },
              {
                $group: {
                  _id: "$_id.day",
                  calls: { $sum: "$calls" },
                  costMicros: { $sum: "$costMicros" },
                  errors: { $sum: "$errors" },
                  users: { $sum: { $cond: [{ $eq: ["$_id.user", null] }, 0, 1] } },
                },
              },
            ],
          },
        },
      ])
      .next(),
    calls.find({}, { projection: { at: 1 } }).sort({ at: 1 }).limit(1).next(),
    d
      .collection<UserDoc>("users")
      .aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            new: { $sum: { $cond: [{ $gte: ["$createdAt", since] }, 1, 0] } },
            seen: { $sum: { $cond: [{ $gte: ["$lastSeenAt", since] }, 1, 0] } },
            grantMicros: { $sum: "$grantMicros" },
            spentMicros: { $sum: { $min: ["$spentMicros", "$grantMicros"] } },
            byokSpentMicros: { $sum: "$byokSpentMicros" },
          },
        },
      ])
      .next(),
    d
      .collection<{ _id: string; gate?: Record<string, number> }>("usage_daily")
      .find({ _id: { $gte: dayKey(since) }, gate: { $exists: true } }, { projection: { gate: 1 } })
      .toArray(),
    d.collection<SessionDoc>("auth_sessions").distinct("userId", { expiresAt: { $gt: now } }),
    d.collection<SessionDoc>("auth_sessions").countDocuments({ expiresAt: { $gt: now } }),
    d.collection<KeyDoc>("byok_keys").countDocuments({ expiresAt: { $gt: now } }),
    d.collection<{ _id: string; spentMicros?: number }>("rate_limits").findOne({ _id: `house:$:${today}` }),
    d.collection<{ _id: string; count?: number }>("rate_limits").findOne({ _id: `grants:${today}` }),
  ]);

  const gateTotals = new Map<string, number>();
  for (const row of gateRows) {
    for (const [code, n] of Object.entries(row.gate ?? {})) gateTotals.set(code, (gateTotals.get(code) ?? 0) + n);
  }

  const dailyRows = new Map<string, Overview["daily"][number]>(
    ((facet?.daily ?? []) as Document[]).map((r) => [
      r._id as string,
      { date: r._id, calls: r.calls, costMicros: r.costMicros, errors: r.errors, users: r.users },
    ]),
  );

  const totalsRow = (facet?.totals as Document[] | undefined)?.[0];
  return {
    days,
    loggingSince: first ? first.at.toISOString() : null,
    totals: {
      ...stats(totalsRow),
      activeUsers: (facet?.users as Document[] | undefined)?.[0]?.n ?? 0,
      anonymousCalls: totalsRow?.anonymous ?? 0,
    },
    funding: ((facet?.funding ?? []) as Document[]).map((r) => ({ kind: r._id, calls: r.calls, costMicros: r.costMicros })),
    surfaces: ((facet?.surfaces ?? []) as Document[]).map((r) => ({ surface: r._id, calls: r.calls, costMicros: r.costMicros })),
    daily: fillDays(days, dailyRows, () => ({ date: "", calls: 0, costMicros: 0, errors: 0, users: 0 })).map(
      ({ date, value }) => ({ ...value, date }),
    ),
    users: {
      total: userAgg?.total ?? 0,
      new: userAgg?.new ?? 0,
      seen: userAgg?.seen ?? 0,
      grantMicros: userAgg?.grantMicros ?? 0,
      spentMicros: userAgg?.spentMicros ?? 0,
      byokSpentMicros: userAgg?.byokSpentMicros ?? 0,
    },
    gates: [...gateTotals.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    live: {
      sessions,
      signedInUsers: sessionUsers.length,
      keys,
      houseSpentMicros: houseDoc?.spentMicros ?? 0,
      houseBudgetMicros: settings.houseBudgetMicros,
      grantsToday: grantsDoc?.count ?? 0,
      grantsDaily: settings.grantsDaily,
    },
  };
}

// ---- AI calls -----------------------------------------------------------------------------

export interface AiAnalytics {
  days: WindowDays;
  byModel: (CallStats & { surface: string; model: string | null })[];
  errors: { surface: string; error: string; count: number }[];
  stopReasons: { stopReason: string; count: number }[];
  topSpenders: { userId: string; login: string; calls: number; costMicros: number }[];
  recent: RecentCall[];
}

export interface RecentCall {
  id: string;
  at: string;
  surface: string;
  funding: string;
  userId: string | null;
  login: string | null;
  model: string | null;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costMicros: number;
  latencyMs: number;
  stopReason: string | null;
  error: string | null;
}

async function recentCalls(filter: Document, limit: number): Promise<RecentCall[]> {
  const rows = await (await db())
    .collection<CallDoc>("ai_calls")
    .find(filter, { projection: { expiresAt: 0 } })
    .sort({ at: -1 })
    .limit(limit)
    .toArray();
  const logins = await loginsFor(rows.map((r) => r.userId));
  return rows.map((r) => ({
    id: r._id.toHexString(),
    at: r.at.toISOString(),
    surface: r.surface,
    funding: r.funding,
    userId: r.userId,
    login: r.userId ? (logins.get(r.userId) ?? null) : null,
    model: r.model,
    requests: r.requests,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
    costMicros: r.costMicros,
    latencyMs: r.latencyMs,
    stopReason: r.stopReason,
    error: r.error,
  }));
}

export async function aiAnalytics(days: WindowDays): Promise<AiAnalytics> {
  const d = await db();
  const since = sinceDate(days);
  const [facet, recent] = await Promise.all([
    d
      .collection<CallDoc>("ai_calls")
      .aggregate([
        { $match: { at: { $gte: since } } },
        {
          $facet: {
            byModel: [{ $group: { _id: { surface: "$surface", model: "$model" }, ...callStats } }, { $sort: { costMicros: -1 } }],
            errors: [
              { $match: { error: { $ne: null } } },
              { $group: { _id: { surface: "$surface", error: "$error" }, count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 25 },
            ],
            stopReasons: [{ $group: { _id: "$stopReason", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
            topSpenders: [
              { $match: { userId: { $ne: null } } },
              { $group: { _id: "$userId", calls: { $sum: 1 }, costMicros: { $sum: "$costMicros" } } },
              { $sort: { costMicros: -1 } },
              { $limit: 10 },
            ],
          },
        },
      ])
      .next(),
    recentCalls({ at: { $gte: since } }, 50),
  ]);

  const spenders = (facet?.topSpenders ?? []) as Document[];
  const logins = await loginsFor(spenders.map((r) => r._id));
  return {
    days,
    byModel: ((facet?.byModel ?? []) as Document[]).map((r) => ({ ...stats(r), surface: r._id.surface, model: r._id.model ?? null })),
    errors: ((facet?.errors ?? []) as Document[]).map((r) => ({ surface: r._id.surface, error: r._id.error, count: r.count })),
    stopReasons: ((facet?.stopReasons ?? []) as Document[]).map((r) => ({ stopReason: r._id ?? "none", count: r.count })),
    topSpenders: spenders.map((r) => ({ userId: r._id, login: logins.get(r._id) ?? r._id, calls: r.calls, costMicros: r.costMicros })),
    recent,
  };
}

// ---- users ----------------------------------------------------------------------------------

export interface UserRow {
  userId: string;
  login: string;
  createdAt: string;
  lastSeenAt: string;
  grantMicros: number;
  spentMicros: number;
  byokSpentMicros: number;
  hasKey: boolean;
  calls: number;
  costMicros: number;
  surfaces: string[];
  reviews: number;
  passes: number;
}

export const USER_LIST_LIMIT = 500;

export async function userList(days: WindowDays): Promise<UserRow[]> {
  const d = await db();
  const since = sinceDate(days);
  const [users, callRows, reviewRows, keyUsers] = await Promise.all([
    d.collection<UserDoc>("users").find({}).sort({ lastSeenAt: -1 }).limit(USER_LIST_LIMIT).toArray(),
    d
      .collection<CallDoc>("ai_calls")
      .aggregate([
        { $match: { at: { $gte: since }, userId: { $ne: null } } },
        { $group: { _id: "$userId", calls: { $sum: 1 }, costMicros: { $sum: "$costMicros" }, surfaces: { $addToSet: "$surface" } } },
      ])
      .toArray(),
    d
      .collection<ReviewDoc>("tutor_reviews")
      .aggregate([
        { $match: { at: { $gte: since }, userId: { $ne: null } } },
        { $group: { _id: "$userId", reviews: { $sum: 1 }, passes: { $sum: { $cond: [{ $eq: ["$verdict", "pass"] }, 1, 0] } } } },
      ])
      .toArray(),
    d.collection<KeyDoc>("byok_keys").distinct("userId", { expiresAt: { $gt: new Date() } }),
  ]);

  const callsBy = new Map(callRows.map((r) => [r._id as string, r]));
  const reviewsBy = new Map(reviewRows.map((r) => [r._id as string, r]));
  const withKey = new Set(keyUsers);
  return users.map((u) => ({
    userId: u._id,
    login: u.login,
    createdAt: u.createdAt.toISOString(),
    lastSeenAt: u.lastSeenAt.toISOString(),
    grantMicros: u.grantMicros,
    spentMicros: u.spentMicros,
    byokSpentMicros: u.byokSpentMicros,
    hasKey: withKey.has(u._id),
    calls: callsBy.get(u._id)?.calls ?? 0,
    costMicros: callsBy.get(u._id)?.costMicros ?? 0,
    surfaces: ((callsBy.get(u._id)?.surfaces as string[] | undefined) ?? []).sort(),
    reviews: reviewsBy.get(u._id)?.reviews ?? 0,
    passes: reviewsBy.get(u._id)?.passes ?? 0,
  }));
}

export interface UserDetail {
  user: Omit<UserRow, "calls" | "costMicros" | "surfaces" | "reviews" | "passes">;
  sessions: number;
  reviews: { total: number; passes: number };
  surfaces: (CallStats & { surface: string })[];
  labs: LabRow[];
  recentCalls: RecentCall[];
  recentReviews: { at: string; labIds: string[]; verdict: string; met: number; criteria: number }[];
}

export async function userDetail(userId: string, days: WindowDays): Promise<UserDetail | null> {
  const d = await db();
  const since = sinceDate(days);
  const now = new Date();
  const user = await d.collection<UserDoc>("users").findOne({ _id: userId });
  if (!user) return null;

  const [sessions, key, surfaceRows, labs, recent, reviews, reviewTotals] = await Promise.all([
    d.collection<SessionDoc>("auth_sessions").countDocuments({ userId, expiresAt: { $gt: now } }),
    d.collection<KeyDoc>("byok_keys").findOne({ userId, expiresAt: { $gt: now } }, { projection: { _id: 1 } }),
    d
      .collection<CallDoc>("ai_calls")
      .aggregate([{ $match: { userId, at: { $gte: since } } }, { $group: { _id: "$surface", ...callStats } }, { $sort: { calls: -1 } }])
      .toArray(),
    labRows({ userId, at: { $gte: since } }),
    recentCalls({ userId, at: { $gte: since } }, 50),
    d
      .collection<ReviewDoc>("tutor_reviews")
      .find({ userId, at: { $gte: since } })
      .sort({ at: -1 })
      .limit(30)
      .toArray(),
    d
      .collection<ReviewDoc>("tutor_reviews")
      .aggregate([
        { $match: { userId, at: { $gte: since } } },
        { $group: { _id: null, total: { $sum: 1 }, passes: { $sum: { $cond: [{ $eq: ["$verdict", "pass"] }, 1, 0] } } } },
      ])
      .next(),
  ]);

  return {
    user: {
      userId: user._id,
      login: user.login,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt.toISOString(),
      grantMicros: user.grantMicros,
      spentMicros: user.spentMicros,
      byokSpentMicros: user.byokSpentMicros,
      hasKey: Boolean(key),
    },
    sessions,
    reviews: { total: reviewTotals?.total ?? 0, passes: reviewTotals?.passes ?? 0 },
    surfaces: surfaceRows.map((r) => ({ ...stats(r), surface: r._id as string })),
    labs,
    recentCalls: recent,
    recentReviews: reviews.map((r) => ({
      at: r.at.toISOString(),
      labIds: r.labIds,
      verdict: r.verdict,
      met: r.met,
      criteria: r.criteria,
    })),
  };
}

// ---- learning -----------------------------------------------------------------------------------

export interface LabRow {
  labId: string;
  title: string;
  reviews: number;
  passes: number;
  learners: number;
  met: number;
  criteria: number;
  missing: number;
  incorrect: number;
}

const LAB_TITLES = new Map(CORPUS_INDEX.map((d) => [d.id, d.title]));

async function labRows(match: Document): Promise<LabRow[]> {
  const rows = await (await db())
    .collection<ReviewDoc>("tutor_reviews")
    .aggregate([
      { $match: match },
      { $unwind: "$labIds" },
      {
        $group: {
          _id: "$labIds",
          reviews: { $sum: 1 },
          passes: { $sum: { $cond: [{ $eq: ["$verdict", "pass"] }, 1, 0] } },
          learners: { $addToSet: "$userId" },
          met: { $sum: "$met" },
          criteria: { $sum: "$criteria" },
          missing: { $sum: "$missing" },
          incorrect: { $sum: "$incorrect" },
        },
      },
      { $set: { learners: { $size: { $setDifference: ["$learners", [null]] } } } },
    ])
    .toArray();
  // Course order, not popularity: a lab's position in the course is what a pass rate is read against.
  const order = new Map(CORPUS_INDEX.map((d, i) => [d.id, i]));
  return rows
    .map((r) => ({
      labId: r._id as string,
      title: LAB_TITLES.get(r._id) ?? r._id,
      reviews: r.reviews,
      passes: r.passes,
      learners: r.learners,
      met: r.met,
      criteria: r.criteria,
      missing: r.missing,
      incorrect: r.incorrect,
    }))
    .sort((a, b) => (order.get(a.labId) ?? 99) - (order.get(b.labId) ?? 99));
}

export interface Learning {
  days: WindowDays;
  totals: { reviews: number; passes: number; learners: number; anonymous: number };
  /** Distinct signed-in learners who reached each Tutor step. Anonymous calls counted separately. */
  funnel: { step: string; learners: number; calls: number }[];
  labs: LabRow[];
  mistakes: { id: string; labId: string; attempts: number; fixed: number }[];
  learners: { userId: string; login: string; reviews: number; passes: number; labs: number; lastAt: string }[];
}

const FUNNEL = ["tutor_plan", "tutor_lesson", "tutor_hint", "tutor_review"] as const;

export async function learning(days: WindowDays): Promise<Learning> {
  const d = await db();
  const since = sinceDate(days);
  const reviews = d.collection<ReviewDoc>("tutor_reviews");

  const [facet, funnelRows, labs] = await Promise.all([
    reviews
      .aggregate([
        { $match: { at: { $gte: since } } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  reviews: { $sum: 1 },
                  passes: { $sum: { $cond: [{ $eq: ["$verdict", "pass"] }, 1, 0] } },
                  anonymous: { $sum: { $cond: [{ $eq: ["$userId", null] }, 1, 0] } },
                },
              },
            ],
            learnerCount: [{ $match: { userId: { $ne: null } } }, { $group: { _id: "$userId" } }, { $count: "n" }],
            mistakes: [
              { $unwind: "$mistakes" },
              {
                $group: {
                  _id: "$mistakes.id",
                  attempts: { $sum: 1 },
                  fixed: { $sum: { $cond: ["$mistakes.fixed", 1, 0] } },
                },
              },
              { $sort: { attempts: -1 } },
            ],
            learners: [
              { $match: { userId: { $ne: null } } },
              {
                $group: {
                  _id: "$userId",
                  reviews: { $sum: 1 },
                  passes: { $sum: { $cond: [{ $eq: ["$verdict", "pass"] }, 1, 0] } },
                  labs: { $addToSet: "$labIds" },
                  lastAt: { $max: "$at" },
                },
              },
              { $set: { labs: { $size: { $reduce: { input: "$labs", initialValue: [], in: { $setUnion: ["$$value", "$$this"] } } } } } },
              { $sort: { lastAt: -1 } },
              { $limit: 100 },
            ],
          },
        },
      ])
      .next(),
    d
      .collection<CallDoc>("ai_calls")
      .aggregate([
        { $match: { at: { $gte: since }, surface: { $in: [...FUNNEL] }, error: null } },
        { $group: { _id: "$surface", calls: { $sum: 1 }, learners: { $addToSet: "$userId" } } },
        { $set: { learners: { $size: { $setDifference: ["$learners", [null]] } } } },
      ])
      .toArray(),
    labRows({ at: { $gte: since } }),
  ]);

  const learnerRows = (facet?.learners ?? []) as Document[];
  const logins = await loginsFor(learnerRows.map((r) => r._id));
  const funnelBy = new Map(funnelRows.map((r) => [r._id as string, r]));
  const totals = (facet?.totals as Document[] | undefined)?.[0];

  return {
    days,
    totals: {
      reviews: totals?.reviews ?? 0,
      passes: totals?.passes ?? 0,
      learners: (facet?.learnerCount as Document[] | undefined)?.[0]?.n ?? 0,
      anonymous: totals?.anonymous ?? 0,
    },
    funnel: FUNNEL.map((step) => ({ step, learners: funnelBy.get(step)?.learners ?? 0, calls: funnelBy.get(step)?.calls ?? 0 })),
    labs,
    mistakes: ((facet?.mistakes ?? []) as Document[]).map((r) => ({
      id: r._id,
      labId: mistakeLab(r._id) ?? "",
      attempts: r.attempts,
      fixed: r.fixed,
    })),
    learners: learnerRows.map((r) => ({
      userId: r._id,
      login: logins.get(r._id) ?? r._id,
      reviews: r.reviews,
      passes: r.passes,
      labs: r.labs,
      lastAt: (r.lastAt as Date).toISOString(),
    })),
  };
}

// ---- feedback -----------------------------------------------------------------------------------

export interface FeedbackFilter {
  status: "new" | "resolved" | "all";
  surface: FeedbackSurface | "all";
  rating: "up" | "down" | "all";
  commentsOnly: boolean;
}

export function parseFeedbackFilter(q: Record<string, string | string[] | undefined>): FeedbackFilter {
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
  return {
    status: pick(one("status"), ["new", "resolved", "all"] as const, "new"),
    surface: pick(one("surface"), [...FEEDBACK_SURFACES, "all"] as const, "all"),
    rating: pick(one("rating"), ["up", "down", "all"] as const, "all"),
    commentsOnly: one("comments") === "1",
  };
}

export interface FeedbackItem {
  id: string;
  createdAt: string;
  surface: string;
  site: string;
  rating: "up" | "down" | null;
  reasons: string[];
  category: string | null;
  comment: string | null;
  path: string | null;
  labIds: string[];
  userId: string | null;
  login: string | null;
  status: "new" | "resolved";
}

export interface FeedbackView {
  days: WindowDays;
  totals: { items: number; up: number; down: number; comments: number; open: number };
  surfaces: { surface: string; up: number; down: number; comments: number }[];
  pages: { path: string; up: number; down: number; comments: number }[];
  labs: { labId: string; title: string; up: number; down: number }[];
  reasons: { reason: string; count: number }[];
  items: FeedbackItem[];
}

const tally = {
  up: { $sum: { $cond: [{ $eq: ["$rating", "up"] }, 1, 0] } },
  down: { $sum: { $cond: [{ $eq: ["$rating", "down"] }, 1, 0] } },
  comments: { $sum: { $cond: [{ $ne: ["$comment", null] }, 1, 0] } },
};

export const FEEDBACK_LIST_LIMIT = 100;

function toItem(r: FeedbackDoc, logins: Map<string, string>): FeedbackItem {
  return {
    id: r._id,
    createdAt: r.createdAt.toISOString(),
    surface: r.surface,
    site: r.site,
    rating: r.rating,
    reasons: r.reasons,
    category: r.category,
    comment: r.comment,
    path: r.path,
    labIds: r.labIds,
    userId: r.userId,
    login: r.userId ? (logins.get(r.userId) ?? null) : null,
    status: r.status,
  };
}

export async function feedbackView(days: WindowDays, filter: FeedbackFilter): Promise<FeedbackView> {
  const d = await db();
  const since = sinceDate(days);
  const col = d.collection<FeedbackDoc>("feedback");

  const match: Document = { createdAt: { $gte: since } };
  if (filter.status !== "all") match.status = filter.status;
  if (filter.surface !== "all") match.surface = filter.surface;
  if (filter.rating !== "all") match.rating = filter.rating;
  if (filter.commentsOnly) match.comment = { $ne: null };

  const [facet, rows] = await Promise.all([
    col
      .aggregate([
        // The summary ignores the list's filters: it is the shape of the whole window.
        { $match: { createdAt: { $gte: since } } },
        {
          $facet: {
            totals: [
              { $group: { _id: null, items: { $sum: 1 }, ...tally, open: { $sum: { $cond: [{ $eq: ["$status", "new"] }, 1, 0] } } } },
            ],
            surfaces: [{ $group: { _id: "$surface", ...tally } }, { $sort: { down: -1 } }],
            pages: [
              { $match: { path: { $ne: null }, surface: "page" } },
              { $group: { _id: "$path", ...tally } },
              { $sort: { down: -1, comments: -1 } },
              { $limit: 15 },
            ],
            labs: [{ $unwind: "$labIds" }, { $group: { _id: "$labIds", up: tally.up, down: tally.down } }],
            reasons: [{ $unwind: "$reasons" }, { $group: { _id: "$reasons", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
          },
        },
      ])
      .next(),
    col.find(match).sort({ createdAt: -1 }).limit(FEEDBACK_LIST_LIMIT).toArray(),
  ]);

  const logins = await loginsFor(rows.map((r) => r.userId));
  const t = (facet?.totals as Document[] | undefined)?.[0];
  const order = new Map(CORPUS_INDEX.map((c, i) => [c.id, i]));
  return {
    days,
    totals: { items: t?.items ?? 0, up: t?.up ?? 0, down: t?.down ?? 0, comments: t?.comments ?? 0, open: t?.open ?? 0 },
    surfaces: ((facet?.surfaces ?? []) as Document[]).map((r) => ({ surface: r._id, up: r.up, down: r.down, comments: r.comments })),
    pages: ((facet?.pages ?? []) as Document[]).map((r) => ({ path: r._id, up: r.up, down: r.down, comments: r.comments })),
    labs: ((facet?.labs ?? []) as Document[])
      .map((r) => ({ labId: r._id as string, title: LAB_TITLES.get(r._id) ?? r._id, up: r.up, down: r.down }))
      .sort((a, b) => (order.get(a.labId) ?? 99) - (order.get(b.labId) ?? 99)),
    reasons: ((facet?.reasons ?? []) as Document[]).map((r) => ({ reason: r._id, count: r.count })),
    items: rows.map((r) => toItem(r, logins)),
  };
}

/** Open feedback, all time, for the tab badge and the overview. */
export async function openFeedbackCount(): Promise<number> {
  return (await db()).collection<FeedbackDoc>("feedback").countDocuments({ status: "new" });
}

export async function feedbackForUser(userId: string, days: WindowDays): Promise<FeedbackItem[]> {
  const rows = await (await db())
    .collection<FeedbackDoc>("feedback")
    .find({ userId, createdAt: { $gte: sinceDate(days) } })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
  return rows.map((r) => toItem(r, new Map()));
}
