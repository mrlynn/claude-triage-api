/**
 * The one SDK failure that is not an HTTP error: `messages.parse()` throwing
 * because the model's text did not parse or validate. It must be reported as
 * an upstream schema miss (502), not as this service's own bug (500).
 */
import assert from "node:assert/strict";
import test from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { toHttpError } from "./errors.js";

test("a structured-output parse failure is a 502 unparseable_output", () => {
  const err = new Anthropic.AnthropicError(
    "Failed to parse structured output: invalid_value at category",
  );
  const { status, body } = toHttpError(err);
  assert.equal(status, 502);
  assert.equal(body.error, "unparseable_output");
  assert.equal(body.retryable, false);
});

test("any other non-HTTP error is still a 500", () => {
  const { status, body } = toHttpError(new Error("boom"));
  assert.equal(status, 500);
  assert.equal(body.error, "internal_error");
});
