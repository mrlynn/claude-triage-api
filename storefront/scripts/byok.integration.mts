/**
 * The trial ledger and the funding gate against a real MongoDB.
 *
 * Not part of `npm test`: it needs a database, and the property it checks —
 * that twenty concurrent reservations for the last dollar let exactly the
 * right number through — is a property of the database's atomic update, which
 * a fake would only restate. Point it at a throwaway instance:
 *
 *   mongod --dbpath /tmp/nw-test --port 27199
 *   cd storefront
 *   MONGODB_URI=mongodb://127.0.0.1:27199 NODE_PATH=scripts/test-stubs \
 *     npx tsx --test scripts/byok.integration.mts
 *
 * It drops its own database (`northwind_byok_it`) before running. NODE_PATH
 * supplies an empty `server-only`, which only Next can resolve.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { before, after, test } from "node:test";

if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI to a throwaway MongoDB. See the header of this file.");
if (/mongodb\.net/.test(process.env.MONGODB_URI)) throw new Error("Refusing to run against Atlas. Use a throwaway local instance.");
process.env.MONGODB_DB = "northwind_byok_it";
process.env.GITHUB_CLIENT_ID = "test-client";
process.env.GITHUB_CLIENT_SECRET = "test-secret";
process.env.BYOK_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.ANTHROPIC_API_KEY = "sk-ant-house-" + "h".repeat(30);
process.env.TRIAL_GRANT_USD = "2";
process.env.TUTOR_IP_LIMIT = "10000";
process.env.LIVE_IP_LIMIT = "10000";

const { getDb } = await import("../lib/mongo");
const { estimateMicros } = await import("../lib/cost");
const { reserveTrial, reserveHouse, adjustTrial } = await import("../lib/ledger");
const { createSession, upsertUser, destroySession, SESSION_COOKIE } = await import("../lib/identity");
const { guardAi, settle, keyError, storeKey, accountFor, noteUsage, AiGateError } = await import("../lib/funding");
const { houseClient } = await import("../lib/anthropicClient");
const { seal, sha256 } = await import("../lib/secrets");
const { APIError } = await import("@anthropic-ai/sdk");

const db = await getDb();
const OLD = "2015-01-01T00:00:00Z";
let nextGithubId = 1000;

before(async () => {
  await db.dropDatabase();
});

after(async () => {
  await db.dropDatabase();
  // The client is cached on globalThis for the app's sake; a test process has to let go of it.
  const cached = (globalThis as unknown as { _northwindMongo?: Promise<{ close(): Promise<void> }> })._northwindMongo;
  await (await cached)?.close();
});

const mode = (m: "shadow" | "enforce") => {
  process.env.BYOK_MODE = m;
};

/** A request from its own IP, so the per-IP windows of one test never touch another's. */
function requestWith(token?: string): Request {
  const headers = new Headers({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${nextGithubId % 250}.${Math.floor(Math.random() * 250)}` });
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  return new Request("https://northwind.mlynn.dev/api/tutor/hint", { method: "POST", headers });
}

async function signedIn(createdAt = OLD) {
  const user = await upsertUser({ id: nextGithubId++, login: `learner${nextGithubId}`, created_at: createdAt });
  const token = await createSession(user._id);
  return { user, token };
}

test("twenty concurrent reservations against credit for five: exactly five succeed", async () => {
  const est = estimateMicros("tutor_hint");
  const { user } = await signedIn();
  await db.collection("users").updateOne({ _id: user._id as never }, { $set: { grantMicros: est * 5 } });

  const results = await Promise.all(Array.from({ length: 20 }, () => reserveTrial(user._id, est)));
  assert.equal(results.filter(Boolean).length, 5);
  const after = await db.collection("users").findOne({ _id: user._id as never });
  assert.equal(after?.spentMicros, est * 5);
});

test("the house budget holds under concurrency, and refuses by duplicate key once full", async () => {
  process.env.HOUSE_DAILY_BUDGET_USD = String((3 * 100_000) / 1_000_000);
  const results = await Promise.all(Array.from({ length: 10 }, () => reserveHouse(100_000)));
  assert.equal(results.filter(Boolean).length, 3);
  process.env.HOUSE_DAILY_BUDGET_USD = "1000";
  await db.collection("rate_limits").deleteMany({ _id: { $regex: /^house:/ } as never });
});

test("grants: an old account gets $2 once, a new account gets nothing", async () => {
  const { user } = await signedIn();
  assert.equal(user.grantMicros, 2_000_000);
  await adjustTrial(user._id, 500_000);
  const again = await upsertUser({ id: Number(user._id.slice(3)), login: "renamed", created_at: OLD });
  assert.equal(again.grantMicros, 2_000_000);
  assert.equal(again.spentMicros, 500_000, "signing in again must not reset spend");
  assert.equal(again.login, "renamed");

  const young = await upsertUser({ id: nextGithubId++, login: "fresh", created_at: new Date().toISOString() });
  assert.equal(young.grantMicros, 0);
});

test("enforce: anonymous visitors are asked to sign in", async () => {
  mode("enforce");
  await assert.rejects(guardAi(requestWith(), "tutor", "tutor_hint"), (e) => e instanceof AiGateError && e.code === "sign_in_required" && e.status === 401);
  assert.equal((await accountFor(requestWith())).mode, "anon");
});

test("enforce: a trial call reserves the worst case and settle refunds down to the real cost", async () => {
  mode("enforce");
  const { user, token } = await signedIn();
  const funding = await guardAi(requestWith(token), "tutor", "tutor_hint");
  assert.equal(funding.kind, "trial");
  assert.equal(funding.client, houseClient());

  const reserved = await db.collection("users").findOne({ _id: user._id as never });
  assert.equal(reserved?.spentMicros, estimateMicros("tutor_hint"));

  const meter = await settle(funding, 12_345);
  assert.equal(meter?.mode, "trial");
  assert.equal(meter?.trial?.spentUsd, 0.012345);
  assert.equal((await settle(funding, 99_999)), null, "settling twice is a no-op");
  const settled = await db.collection("users").findOne({ _id: user._id as never });
  assert.equal(settled?.spentMicros, 12_345);
});

test("enforce: a failed call refunds the whole reservation", async () => {
  mode("enforce");
  const { user, token } = await signedIn();
  const funding = await guardAi(requestWith(token), "tutor", "tutor_lesson");
  await settle(funding, 0);
  assert.equal((await db.collection("users").findOne({ _id: user._id as never }))?.spentMicros, 0);
});

test("enforce: credit that cannot cover the worst case is refused before the call, and cheaper surfaces still run", async () => {
  mode("enforce");
  const { user, token } = await signedIn();
  const remaining = estimateMicros("live") + 1;
  await db.collection("users").updateOne({ _id: user._id as never }, { $set: { spentMicros: 2_000_000 - remaining } });

  await assert.rejects(
    guardAi(requestWith(token), "tutor", "tutor_lesson"),
    (e) => e instanceof AiGateError && e.code === "trial_exhausted" && e.status === 402 && e.meter?.mode === "trial",
  );
  const live = await guardAi(requestWith(token), "live", "live");
  assert.equal(live.kind, "trial");
  await settle(live, estimateMicros("live"));
  assert.equal((await accountFor(requestWith(token))).mode, "exhausted");
});

test("enforce: the house budget refuses trial calls and gives the learner's reservation back", async () => {
  mode("enforce");
  const { user, token } = await signedIn();
  process.env.HOUSE_DAILY_BUDGET_USD = "0.000001";
  await reserveHouse(1); // today's document exists and is full
  await assert.rejects(guardAi(requestWith(token), "tutor", "tutor_hint"), (e) => e instanceof AiGateError && e.code === "house_budget");
  assert.equal((await db.collection("users").findOne({ _id: user._id as never }))?.spentMicros, 0);
  process.env.HOUSE_DAILY_BUDGET_USD = "1000";
  await db.collection("rate_limits").deleteMany({ _id: { $regex: /^house:/ } as never });
});

test("shadow: nobody is refused, but spend is still recorded", async () => {
  mode("shadow");
  const anon = await guardAi(requestWith(), "tutor", "tutor_hint");
  assert.equal(anon.kind, "house");

  const { user, token } = await signedIn();
  await db.collection("users").updateOne({ _id: user._id as never }, { $set: { spentMicros: 2_000_000 } });
  const funding = await guardAi(requestWith(token), "tutor", "tutor_lesson");
  assert.equal(funding.kind, "trial");
  await settle(funding, 1_000);
  assert.equal((await db.collection("users").findOne({ _id: user._id as never }))?.spentMicros, 2_001_000);
});

test("byok: a stored key is used instead of the house key, and never debits credit", async () => {
  mode("enforce");
  const { user, token } = await signedIn();
  const sessionHash = sha256(token);
  const learnerKey = "sk-ant-learner-" + "k".repeat(30);
  await storeKey(sessionHash, user._id, seal(learnerKey, sessionHash), learnerKey.slice(-4));

  const funding = await guardAi(requestWith(token), "tutor", "tutor_lesson");
  assert.equal(funding.kind, "byok");
  assert.notEqual(funding.client, houseClient());
  assert.equal(funding.client.apiKey, learnerKey);

  const meter = await settle(funding, 50_000);
  assert.equal(meter?.mode, "byok");
  assert.equal(meter?.key?.last4, "kkkk");
  assert.equal(meter?.key?.sessionSpentUsd, 0.05);
  assert.equal((await db.collection("users").findOne({ _id: user._id as never }))?.spentMicros, 0);

  const account = await accountFor(requestWith(token));
  assert.ok(!JSON.stringify(account).includes(learnerKey), "the account view never carries the key");
});

test("byok: a key sealed to one session is not usable from another session of the same user", async () => {
  mode("enforce");
  const { user, token } = await signedIn();
  const other = await createSession(user._id);
  const learnerKey = "sk-ant-learner-" + "z".repeat(30);
  await storeKey(sha256(token), user._id, seal(learnerKey, sha256(token)), "zzzz");
  // Copy the sealed row under the other session's id: authentication must fail.
  const row = await db.collection("byok_keys").findOne({ _id: sha256(token) as never });
  await db.collection("byok_keys").insertOne({ ...row, _id: sha256(other) as never });

  const funding = await guardAi(requestWith(other), "tutor", "tutor_hint");
  assert.equal(funding.kind, "trial");
  assert.equal(await db.collection("byok_keys").findOne({ _id: sha256(other) as never }), null, "the unusable copy is deleted");
  await settle(funding, 0);
});

test("byok: a 401 from Anthropic deletes the key and never falls back to the house key", async () => {
  mode("enforce");
  const { user, token } = await signedIn();
  const sessionHash = sha256(token);
  await storeKey(sessionHash, user._id, seal("sk-ant-revoked-" + "r".repeat(30), sessionHash), "rrrr");
  const funding = await guardAi(requestWith(token), "tutor", "tutor_hint");
  assert.equal(funding.kind, "byok");

  const refused = await keyError(funding, new APIError(401, { type: "authentication_error" }, "invalid x-api-key", new Headers()));
  assert.equal(refused?.code, "key_invalid");
  assert.equal(await db.collection("byok_keys").findOne({ _id: sessionHash as never }), null);

  // The body Anthropic actually sends; the SDK folds it into the message.
  const lowCredit = { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } };
  const quota = await keyError(funding, new APIError(400, lowCredit, undefined, new Headers()));
  assert.equal(quota?.code, "key_quota");
  assert.equal(await keyError(funding, new APIError(500, {}, "overloaded", new Headers())), null);

  const trial = await guardAi(requestWith(await createSession(user._id)), "tutor", "tutor_hint");
  assert.equal(await keyError(trial, new APIError(401, {}, "x", new Headers())), null, "house-key errors are not the learner's to fix");
  await settle(trial, 0);
});

test("sign-out deletes the session and the key sealed to it", async () => {
  mode("enforce");
  const { user, token } = await signedIn();
  const sessionHash = sha256(token);
  await storeKey(sessionHash, user._id, seal("sk-ant-bye-" + "b".repeat(30), sessionHash), "bbbb");
  await destroySession(sessionHash);
  assert.equal(await db.collection("auth_sessions").findOne({ _id: sessionHash as never }), null);
  assert.equal(await db.collection("byok_keys").findOne({ _id: sessionHash as never }), null);
  await assert.rejects(guardAi(requestWith(token), "tutor", "tutor_hint"), (e) => e instanceof AiGateError && e.code === "sign_in_required");
});

/** The call log is fire-and-forget, so a test waits for the row rather than for the write. */
async function waitFor<T>(read: () => Promise<T | null>): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const value = await read();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out waiting for a write");
}

test("admin log: a settled call writes one metadata row, with usage, latency and who paid", async () => {
  mode("enforce");
  const { user, token } = await signedIn();
  const funding = await guardAi(requestWith(token), "tutor", "tutor_hint");
  noteUsage(funding, {
    model: "claude-sonnet-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 0 },
  });
  await settle(funding, 4_321);
  const row = await waitFor(() => db.collection("ai_calls").findOne({ userId: user._id }));
  assert.equal(row.surface, "tutor_hint");
  assert.equal(row.scope, "tutor");
  assert.equal(row.funding, "trial");
  assert.equal(row.model, "claude-sonnet-5");
  assert.equal(row.requests, 1);
  assert.equal(row.cacheReadTokens, 30_000);
  assert.equal(row.costMicros, 4_321);
  assert.equal(row.error, null);
  assert.ok(row.latencyMs >= 0);
  assert.ok(row.expiresAt > new Date(Date.now() + 89 * 86_400_000));
});

test("admin log: a failed call records a code, never the message", async () => {
  mode("enforce");
  const { user, token } = await signedIn();
  const funding = await guardAi(requestWith(token), "tutor", "tutor_hint");
  const upstream = Object.assign(new Error("the learner's secret words"), { status: 529 });
  await settle(funding, 0, upstream);
  const row = await waitFor(() => db.collection("ai_calls").findOne({ userId: user._id }));
  assert.equal(row.error, "http_529");
  assert.equal(row.model, null);
  assert.ok(!JSON.stringify(row).includes("secret"));
});

test("admin log: refusals at the gate are counted per day by code", async () => {
  mode("enforce");
  const day = new Date().toISOString().slice(0, 10);
  const before = ((await db.collection("usage_daily").findOne({ _id: day as never }))?.gate?.sign_in_required as number) ?? 0;
  await assert.rejects(guardAi(requestWith(), "tutor", "tutor_hint"));
  await waitFor(async () => {
    const doc = await db.collection("usage_daily").findOne({ _id: day as never });
    return (doc?.gate?.sign_in_required ?? 0) > before ? doc : null;
  });
});

test("feedback: a rating can be amended once, within the hour, and only by its id", async () => {
  const { createFeedback, amendFeedback } = await import("../lib/feedback");
  const base = {
    surface: "page" as const,
    site: "course" as const,
    rating: "down" as const,
    reasons: [],
    category: null,
    comment: null,
    path: "/docs/labs/lab-5-prompt-caching",
    labIds: ["lab-5"],
  };
  const id = await createFeedback(base, null);
  const row = await db.collection("feedback").findOne({ _id: id as never });
  assert.equal(row?.status, "new");
  assert.ok(row?.expiresAt > new Date(Date.now() + 89 * 86_400_000));

  assert.equal(await amendFeedback(id, { ...base, reasons: ["confusing"], comment: "the TTL bit" }), true);
  assert.equal(await amendFeedback(id, { ...base, comment: "overwrite attempt" }), false, "a second amend matches nothing");
  assert.equal((await db.collection("feedback").findOne({ _id: id as never }))?.comment, "the TTL bit");

  const old = await createFeedback(base, null);
  await db.collection("feedback").updateOne({ _id: old as never }, { $set: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
  assert.equal(await amendFeedback(old, { ...base, comment: "late" }), false, "past the hour it is closed");
  assert.equal(await amendFeedback("x".repeat(43), { ...base, comment: "guess" }), false);
});

test("every new collection carries a TTL index", async () => {
  for (const name of ["users", "auth_sessions", "byok_keys", "ai_calls", "tutor_reviews", "feedback"]) {
    const indexes = await db.collection(name).indexes();
    assert.ok(indexes.some((i) => i.expireAfterSeconds === 0 && i.key.expiresAt === 1), `${name} has no TTL index`);
  }
});
