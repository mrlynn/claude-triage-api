import "server-only";
import { MongoServerError } from "mongodb";
import { USER_TTL_MS, byokSettings } from "./byokConfig";
import { keyExpiry, type KeyDoc, type UserDoc } from "./identity";
import { getDb } from "./mongo";

/**
 * Trial credit and the house budget, in integer micro-dollars.
 *
 * RESERVE THE WORST CASE, REFUND THE DIFFERENCE. A call's cost is not known
 * until it returns, and by then it has been spent. So before a call, one
 * conditional update takes the most that call could cost (`estimateMicros`)
 * — and only if that still fits under the grant. After it, one more update
 * gives back whatever was not used.
 *
 * The condition lives in the FILTER, which is the whole trick. Two requests
 * racing for the last dollar both send "add $0.20 where spent + $0.20 ≤
 * grant"; the database applies them one at a time, and the second no longer
 * matches. There is no read-then-write anywhere in this file.
 *
 * If the process dies between the two updates, the reservation is never
 * refunded and the learner is over-charged by one estimate. That is the
 * direction to fail in when the thing being protected is the bill.
 */

const houseDocId = () => `house:$:${new Date().toISOString().slice(0, 10)}`;

interface HouseDoc {
  _id: string;
  spentMicros: number;
  expiresAt: Date;
}

const touch = () => ({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + USER_TTL_MS) });

/** Takes `est` from the user's credit if it fits. Null when it does not. */
export async function reserveTrial(userId: string, est: number): Promise<UserDoc | null> {
  const db = await getDb();
  return db.collection<UserDoc>("users").findOneAndUpdate(
    { _id: userId, $expr: { $lte: [{ $add: ["$spentMicros", est] }, "$grantMicros"] } },
    { $inc: { spentMicros: est }, $set: touch() },
    { returnDocument: "after" },
  );
}

/**
 * Unconditional. Shadow mode records what enforcement WOULD have charged
 * without refusing anyone, so the numbers can be read before they bite.
 */
export async function forceReserveTrial(userId: string, est: number): Promise<UserDoc | null> {
  const db = await getDb();
  return db
    .collection<UserDoc>("users")
    .findOneAndUpdate({ _id: userId }, { $inc: { spentMicros: est }, $set: touch() }, { returnDocument: "after" });
}

/** Positive charges more, negative refunds. */
export async function adjustTrial(userId: string, delta: number): Promise<UserDoc | null> {
  const db = await getDb();
  return db
    .collection<UserDoc>("users")
    .findOneAndUpdate({ _id: userId }, { $inc: { spentMicros: delta } }, { returnDocument: "after" });
}

/**
 * The house-wide ceiling for the day. A conditional upsert: when today's
 * document is already too full for `est` the filter matches nothing, the
 * upsert tries to insert a second document with the same `_id`, and the unique
 * index every collection has on `_id` refuses it. That refusal IS the "over
 * budget" answer, and it is exactly as atomic as the per-user one.
 *
 * A plain range on `spentMicros`, not `$expr`: MongoDB refuses `$expr` in an
 * upsert's filter. The budget is a constant here, unlike a user's grant, so
 * the arithmetic can move to this side of the query.
 *
 * Returns the day's document id, or null when over budget. The caller hands
 * the id back to `adjustHouse`, so a call that straddles UTC midnight refunds
 * the day it was charged to.
 */
export async function reserveHouse(est: number): Promise<string | null> {
  const db = await getDb();
  const { houseBudgetMicros } = byokSettings();
  const _id = houseDocId();
  try {
    await db.collection<HouseDoc>("rate_limits").findOneAndUpdate(
      { _id, spentMicros: { $lte: houseBudgetMicros - est } },
      { $inc: { spentMicros: est }, $setOnInsert: { expiresAt: new Date(Date.now() + 26 * 3_600_000) } },
      { upsert: true },
    );
    return _id;
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return null;
    throw error;
  }
}

export async function adjustHouse(dayId: string, delta: number): Promise<void> {
  const db = await getDb();
  await db.collection<HouseDoc>("rate_limits").updateOne({ _id: dayId }, { $inc: { spentMicros: delta } });
}

/** BYOK spend is metered for the learner's own information and never limits anything. */
export async function recordByokSpend(
  sessionHash: string,
  userId: string,
  micros: number,
): Promise<{ key: KeyDoc | null; user: UserDoc | null }> {
  const db = await getDb();
  const [key, user] = await Promise.all([
    db.collection<KeyDoc>("byok_keys").findOneAndUpdate(
      { _id: sessionHash },
      { $inc: { sessionSpentMicros: micros }, $set: { expiresAt: keyExpiry() } },
      { returnDocument: "after" },
    ),
    db
      .collection<UserDoc>("users")
      .findOneAndUpdate({ _id: userId }, { $inc: { byokSpentMicros: micros }, $set: touch() }, { returnDocument: "after" }),
  ]);
  return { key, user };
}
