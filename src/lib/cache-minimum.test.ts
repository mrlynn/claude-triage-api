/**
 * The caching minimum, tested against the prefix this service actually sends.
 *
 * TEACHING NOTE: this file exists because the labs used to assert a flat
 * ~1024-token minimum for every model. That number was wrong for the model the
 * course configures (Opus 5 caches from 512) and wrong by four times for the
 * cheap tier Lab 7 asks you to compare against (Haiku 4.5 needs 4096). The
 * consequence was not a broken build. It was a cost table in Lab 7 that
 * contained an uncached Haiku run and read as "Haiku is about half the price"
 * — when Haiku is a fifth the price per token and only looked like half
 * because its cache was silently doing nothing.
 *
 * That is the Lab 5 failure mode showing up inside the Lab 7 measurement, and
 * it is exactly the kind of claim that should be pinned by a test rather than
 * by a comment, because comments do not fail.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MODEL_CATALOG, cacheMinimumFor } from "../config.js";
import { buildSystem, volatileContext } from "../prompts.js";

/**
 * Rough token estimate for the frozen prefix. We cannot call countTokens in a
 * unit test (it is a network call), and chars/3.7 is deliberately crude — the
 * assertions below only need to know which side of 512 and 4096 this lands on,
 * and it is not close to either boundary.
 */
function approximatePrefixTokens(): number {
  const [frozen] = buildSystem("triage", volatileContext({ channel: "email" }));
  assert.ok(frozen, "buildSystem must return a frozen block first");
  return Math.round(frozen.text.length / 3.7);
}

test("the caching minimum is per model, not a constant", () => {
  const minimums = Object.values(MODEL_CATALOG).map((m) => m.cacheMinimumTokens);
  assert.ok(
    new Set(minimums).size > 1,
    "if every tier shared a minimum, a literal in the code would be harmless — " +
      "the whole point is that it is not",
  );
});

test("the minimum is not monotonic across tiers", () => {
  // The cheap tier has the LARGEST minimum. Any mental model of the form
  // "cheaper model, smaller everything" gets this backwards and silently
  // loses caching on the tier where the savings mattered most.
  assert.ok(
    cacheMinimumFor("claude-haiku-4-5") > cacheMinimumFor("claude-opus-5"),
    "Haiku 4.5 requires a longer prefix than Opus 5, not a shorter one",
  );
});

test("the handbook prefix caches on the flagship", () => {
  const prefix = approximatePrefixTokens();
  assert.ok(
    prefix >= cacheMinimumFor("claude-opus-5"),
    `frozen prefix (~${prefix} tokens) must clear the Opus 5 minimum ` +
      `(${cacheMinimumFor("claude-opus-5")}); if it stops doing so, Lab 5 has ` +
      `no cache hit to demonstrate`,
  );
});

test("the same prefix does NOT cache on the cheap tier", () => {
  // This is the assertion the course was missing. If someone shortens the
  // handbook far enough, or a future Haiku lowers its minimum, this fails and
  // Lab 7's Step 1 narrative needs rewriting — which is the point.
  const prefix = approximatePrefixTokens();
  assert.ok(
    prefix < cacheMinimumFor("claude-haiku-4-5"),
    `frozen prefix (~${prefix} tokens) is expected to fall SHORT of the ` +
      `Haiku 4.5 minimum (${cacheMinimumFor("claude-haiku-4-5")}). Lab 7 ` +
      `teaches that switching tier silently disables caching here.`,
  );
});

test("an unknown model throws rather than guessing a minimum", () => {
  // Same discipline as pricing: a wrong guess here produces a cost projection
  // that is confidently wrong, which is worse than no projection.
  assert.throws(() => cacheMinimumFor("claude-imaginary-9"));
});
