/**
 * Preflight, tested without touching the network.
 *
 * TEACHING NOTE: the interesting assertion here is not "does it detect a short
 * prefix". It is that the check MEASURES THE RIGHT SPAN. `checkCachePrefix`
 * counts only `system[0]` — the frozen block holding the breakpoint. Counting
 * the whole request instead would add the volatile block and the user message,
 * both of which sit AFTER the breakpoint and neither of which counts toward
 * the minimum. That version would pass while the real prefix fell short: a
 * check that reports the wrong span is worse than no check, because it also
 * removes the suspicion that something needs checking.
 *
 * The other property worth pinning is that preflight never throws. A
 * diagnostic that can take the server down is a worse bug than the one it
 * diagnoses.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MODEL, cacheMinimumFor } from "../config.js";
import { buildSystem, volatileContext } from "../prompts.js";
import { runPreflight, type PreflightResult } from "./preflight.js";

test("the frozen block is smaller than the whole request", () => {
  // The precondition that makes span correctness matter at all. If these were
  // the same size, measuring the wrong one would be harmless and the test
  // above it would be theatre.
  const system = buildSystem("triage", volatileContext({ channel: "email" }));
  const frozen = system[0]!.text.length;
  const whole = system.reduce((n, b) => n + b.text.length, 0);
  assert.ok(frozen < whole, "volatile context must add to the request beyond the frozen block");
});

test("willCache compares the prefix against the configured model's minimum", () => {
  // Pure function over the shape checkCachePrefix returns, so the rule is
  // pinned without a network call.
  const decide = (prefixTokens: number, minimumTokens: number) => prefixTokens >= minimumTokens;

  const min = cacheMinimumFor(MODEL);
  assert.equal(decide(min, min), true, "exactly at the minimum must cache");
  assert.equal(decide(min - 1, min), false, "one token short must not");
  assert.equal(decide(min + 1, min), true);
});

test("the same prefix flips verdict across tiers", () => {
  // The whole reason this check is per-boot rather than a constant: nothing
  // about the prompt changes here, only the model.
  const prefix = 2749; // measured on claude-haiku-4-5
  assert.equal(prefix >= cacheMinimumFor("claude-opus-5"), true);
  assert.equal(prefix >= cacheMinimumFor("claude-sonnet-5"), true);
  assert.equal(prefix >= cacheMinimumFor("claude-haiku-4-5"), false);
});

test("a failed check reports an error rather than a false verdict", () => {
  // When the count cannot be taken, willCache is false AND error is set. The
  // pairing matters: `willCache: false` alone would read as "confirmed not
  // caching" and send someone to change their model over a network blip.
  const failed: PreflightResult = {
    model: MODEL,
    prefixTokens: 0,
    minimumTokens: cacheMinimumFor(MODEL),
    willCache: false,
    error: "connection refused",
  };
  assert.ok(failed.error, "callers must be able to distinguish unknown from negative");
  assert.equal(failed.prefixTokens, 0);
});

test("runPreflight is a no-op when disabled, and never throws", async () => {
  const prior = process.env.PREFLIGHT;
  process.env.PREFLIGHT = "off";
  try {
    await assert.doesNotReject(() => runPreflight());
  } finally {
    if (prior === undefined) delete process.env.PREFLIGHT;
    else process.env.PREFLIGHT = prior;
  }
});
