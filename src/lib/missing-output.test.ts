/**
 * A null `parsed_output` is three different failures. These tests pin which
 * one each `stop_reason` maps to, so a refusal cannot quietly go back to being
 * reported as a schema bug.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { explainMissingOutput } from "./missing-output.js";

test("a refusal is a 422 that carries stop_details", () => {
  const stop_details = {
    type: "refusal",
    category: "cyber",
    explanation: "declined",
  } as const;
  const out = explainMissingOutput({ stop_reason: "refusal", stop_details });
  assert.equal(out.status, 422);
  assert.equal(out.body.error, "refused");
  assert.deepEqual(out.body.stop_details, stop_details);
});

test("hitting max_tokens is reported as truncation, not a schema miss", () => {
  const out = explainMissingOutput({ stop_reason: "max_tokens", stop_details: null });
  assert.equal(out.status, 502);
  assert.equal(out.body.error, "truncated_output");
  assert.equal("stop_details" in out.body, false);
});

test("a normal stop that still failed validation is unparseable", () => {
  const out = explainMissingOutput({ stop_reason: "end_turn", stop_details: null });
  assert.equal(out.status, 502);
  assert.equal(out.body.error, "unparseable_output");
});
