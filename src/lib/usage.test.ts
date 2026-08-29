/**
 * Cost accounting, tested.
 *
 * TEACHING NOTE: this file exists because of Lab 3's usage trap. The final
 * message of an agent loop carries only the final turn's usage, and a service
 * that reports it under-reports a five-turn loop by roughly five times. That
 * is not a crash — it is a dashboard that is quietly wrong about money, which
 * is the failure mode nobody notices until the invoice.
 *
 * Two properties are worth more than all the arithmetic here: that
 * `total_input_tokens` is the sum of THREE fields rather than `input_tokens`,
 * and that `sumUsage` actually sums. Both are one-line mistakes to make and
 * neither one raises anything.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { summarizeUsage, sumUsage, type UsageLike } from "./usage.js";
import { MODEL_CATALOG } from "../config.js";

const MODEL = "claude-opus-5";
const rates = MODEL_CATALOG[MODEL]!;

function usage(over: Partial<UsageLike> = {}): UsageLike {
  return {
    input_tokens: 100,
    output_tokens: 200,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    ...over,
  };
}

test("total input is the sum of fresh, written, and read tokens", () => {
  // The number people expect `input_tokens` to be. Logging only the fresh
  // count on a cached workload shows costs collapsing to near zero, and a
  // broken cache looks exactly like a working one.
  const report = summarizeUsage(
    usage({
      input_tokens: 112,
      cache_creation_input_tokens: 4711,
      cache_read_input_tokens: 0,
    }),
    MODEL,
  );
  assert.equal(report.total_input_tokens, 112 + 4711);
  assert.notEqual(report.total_input_tokens, report.input_tokens);
});

test("null cache fields count as zero rather than poisoning the total", () => {
  const report = summarizeUsage(
    { input_tokens: 10, output_tokens: 5 },
    MODEL,
  );
  assert.equal(report.total_input_tokens, 10);
  assert.equal(Number.isFinite(report.estimated_cost_usd), true);
});

test("cache_hit is true only when tokens were actually read from cache", () => {
  // The assertion `npm run smoke` makes on its second call.
  assert.equal(summarizeUsage(usage({ cache_read_input_tokens: 0 }), MODEL).cache_hit, false);
  assert.equal(summarizeUsage(usage({ cache_read_input_tokens: 1 }), MODEL).cache_hit, true);
  assert.equal(
    summarizeUsage(usage({ cache_creation_input_tokens: 4711 }), MODEL).cache_hit,
    false,
  );
});

test("a warm call is cheaper than the same call uncached", () => {
  const warm = summarizeUsage(
    usage({ input_tokens: 112, cache_read_input_tokens: 4711 }),
    MODEL,
  );
  assert.ok(warm.estimated_cost_usd < warm.uncached_cost_usd);
  assert.ok(warm.savings_usd > 0);
});

test("the cold call costs MORE than no caching at all", () => {
  // The write premium, and the reason Lab 5 Q5 exists: caching a prefix used
  // once is strictly worse than not caching it. If this ever inverts, the
  // multipliers have been mixed up.
  const cold = summarizeUsage(
    usage({ input_tokens: 112, cache_creation_input_tokens: 4711 }),
    MODEL,
  );
  assert.ok(cold.estimated_cost_usd > cold.uncached_cost_usd);
  assert.ok(cold.savings_usd < 0);
});

test("cost is computed at the documented rates", () => {
  // Pins the arithmetic against the catalog rather than a magic number, so a
  // price change updates one place and this still checks the formula.
  const report = summarizeUsage(
    { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000 },
    MODEL,
  );
  const inRate = rates.inputPerMTok / 1_000_000;
  const expected =
    1000 * inRate + 2000 * inRate * rates.cacheReadMultiplier + 500 * (rates.outputPerMTok / 1_000_000);
  assert.equal(report.estimated_cost_usd, Math.round(expected * 1e6) / 1e6);
});

test("batch billing halves the rate", () => {
  const sync = summarizeUsage(usage(), MODEL);
  const batch = summarizeUsage(usage(), MODEL, { batch: true });
  assert.equal(batch.batch, true);
  assert.equal(batch.estimated_cost_usd, Math.round(sync.estimated_cost_usd * rates.batchMultiplier * 1e6) / 1e6);
});

test("an unknown model throws instead of guessing a price", () => {
  // `pricingFor` refuses to default to flagship rates. A cost table that
  // silently guesses is worse than one that crashes: you find out at the
  // invoice rather than at the call site.
  assert.throws(() => summarizeUsage(usage(), "claude-not-a-model"), /No pricing/);
});

test("a dated snapshot prices as its base model", () => {
  const base = summarizeUsage(usage(), "claude-haiku-4-5");
  const dated = summarizeUsage(usage(), "claude-haiku-4-5-20251001");
  assert.equal(dated.estimated_cost_usd, base.estimated_cost_usd);
});

test("sumUsage adds every turn rather than reporting the last one", () => {
  // THE LAB 3 TRAP. Three turns of a loop, each larger than the last because
  // history grows. Reporting the final turn under-reports the call.
  const turns = [100, 300, 900].map((n) =>
    summarizeUsage({ input_tokens: n, output_tokens: 50 }, MODEL),
  );
  const total = sumUsage(turns);
  assert.equal(total.input_tokens, 1300);
  assert.equal(total.output_tokens, 150);
  assert.ok(total.estimated_cost_usd > turns[2]!.estimated_cost_usd);
  assert.equal(
    total.estimated_cost_usd,
    Math.round(turns.reduce((n, t) => n + t.estimated_cost_usd, 0) * 1e6) / 1e6,
  );
});

test("summing turns of one model keeps the model id", () => {
  const turns = [usage(), usage()].map((u) => summarizeUsage(u, MODEL));
  assert.equal(sumUsage(turns).model, MODEL);
});

test("summing across a tier boundary reports 'mixed'", () => {
  // A total spanning two models is not comparable to any single-model figure,
  // and the label is what stops someone quoting it as one.
  const turns = [
    summarizeUsage(usage(), MODEL),
    summarizeUsage(usage(), "claude-haiku-4-5"),
  ];
  assert.equal(sumUsage(turns).model, "mixed");
});

test("summing nothing reports 'none' rather than a made-up model", () => {
  const total = sumUsage([]);
  assert.equal(total.model, "none");
  assert.equal(total.estimated_cost_usd, 0);
  assert.equal(total.cache_hit, false);
});

test("a cache hit on any turn marks the total as a hit", () => {
  const turns = [
    summarizeUsage(usage({ cache_creation_input_tokens: 4711 }), MODEL),
    summarizeUsage(usage({ cache_read_input_tokens: 4711 }), MODEL),
  ];
  assert.equal(sumUsage(turns).cache_hit, true);
});

test("rounding does not accumulate across many turns", () => {
  // Twenty turns of a sub-cent call. If each turn were rounded and re-rounded
  // the total would drift; the queue script sums twenty of these per run.
  const turns = Array.from({ length: 20 }, () =>
    summarizeUsage({ input_tokens: 7, output_tokens: 3 }, MODEL),
  );
  const total = sumUsage(turns);
  const expected = Math.round(turns.reduce((n, t) => n + t.estimated_cost_usd, 0) * 1e6) / 1e6;
  assert.equal(total.estimated_cost_usd, expected);
});
