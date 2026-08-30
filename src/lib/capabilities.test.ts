/**
 * Capability gating, tested.
 *
 * TEACHING NOTE: this file exists because `supportsAdaptiveThinking` sat in
 * MODEL_CATALOG, fully populated for all three tiers, and was read by NOTHING.
 * The flag documented a real constraint and no code consulted it, so
 * `/v1/draft` sent adaptive thinking to every model and returned
 * `adaptive thinking is not supported on this model` — a 400 — the moment
 * TRIAGE_MODEL pointed at Haiku 4.5. `/v1/resolve` had the same shape of bug
 * with `effort`.
 *
 * That is a specific and common failure: tiering treated as a name swap. The
 * cheaper models differ in ways that break a request, not just a budget, and a
 * capability flag nobody reads is indistinguishable from no flag at all. The
 * assertions below are cheap; the bug they catch cost two working routes.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MODEL_CATALOG } from "../config.js";
import { outputConfigFor, thinkingFor } from "./requests.js";

test("effort is dropped on models that reject it", () => {
  assert.deepEqual(outputConfigFor("claude-haiku-4-5", "low"), {
    config: {},
    effortApplied: false,
  });
});

test("effort is sent on models that accept it", () => {
  assert.deepEqual(outputConfigFor("claude-opus-5", "low"), {
    config: { effort: "low" },
    effortApplied: true,
  });
});

test("adaptive thinking is dropped on models that reject it", () => {
  const { thinking, thinkingApplied } = thinkingFor("claude-haiku-4-5");
  assert.equal(thinking, undefined, "sending this field to Haiku 4.5 is a 400");
  assert.equal(thinkingApplied, false);
});

test("adaptive thinking is sent, summarized, on models that accept it", () => {
  const { thinking, thinkingApplied } = thinkingFor("claude-opus-5");
  // `display: "summarized"` is the load-bearing half. Without it Opus 5 streams
  // thinking blocks with empty text, which reads as a long silent pause.
  assert.deepEqual(thinking, { type: "adaptive", display: "summarized" });
  assert.equal(thinkingApplied, true);
});

test("every catalog entry is gated by both flags, not just the ones we remembered", () => {
  // A new row added without these fields would type-error, but a row added
  // with the WRONG values fails here instead of in production. Both helpers
  // must agree with the catalog for every model we ship.
  for (const [model, spec] of Object.entries(MODEL_CATALOG)) {
    assert.equal(
      outputConfigFor(model, "low").effortApplied,
      spec.supportsEffort,
      `${model}: outputConfigFor disagrees with supportsEffort`,
    );
    assert.equal(
      thinkingFor(model).thinkingApplied,
      spec.supportsAdaptiveThinking,
      `${model}: thinkingFor disagrees with supportsAdaptiveThinking`,
    );
  }
});

test("an unknown model throws rather than assuming full capabilities", () => {
  // Assuming support is the dangerous default: it produces a 400 at request
  // time on a model you have never tested, rather than a crash at startup.
  assert.throws(() => thinkingFor("claude-imaginary-9"));
  assert.throws(() => outputConfigFor("claude-imaginary-9", "low"));
});
