/**
 * The router has two destinations now. The property that must survive any
 * future tier change: high-stakes language goes to the flagship regardless of
 * length, and nothing else does.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { pickModel } from "./route-model.js";
import { MODEL_TIERS } from "../config.js";

test("a short message with safety language still goes to the flagship", () => {
  const d = pickModel("my kid swallowed a bit of the lid");
  assert.equal(d.model, MODEL_TIERS.flagship);
});

test("everything without high-stakes language goes to the balanced tier", () => {
  assert.equal(pickModel("Where is my package NW-51907?").model, MODEL_TIERS.balanced);
  assert.equal(pickModel("x".repeat(2_000)).model, MODEL_TIERS.balanced);
});
