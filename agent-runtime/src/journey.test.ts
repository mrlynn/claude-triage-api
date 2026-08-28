import assert from "node:assert/strict";
import test from "node:test";
import { findJourney } from "./journey.js";

test("learning retrieval returns canonical Lab 3 for tool-use questions", () => {
  const matches = findJourney("When should I use tool use in an agent?");
  assert.equal(matches.some((item) => item.id === "lab-3"), true);
  assert.equal(matches.every((item) => item.href.startsWith("/docs/")), true);
});
