import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORT_POLICY, underAuthority, withinAuthority } from "./assistantPolicy";
import { JOURNEY, findJourney } from "./assistantJourney";

/**
 * The rules that have to hold whatever the model does.
 *
 * These are pure functions on purpose: the two guarantees Lab 10 actually
 * makes — that authority is enforced in code, and that a course link is never
 * invented — should be the cheapest things in the repo to check. Containment
 * of prompt injection is covered separately and end-to-end by
 * `npm run eval:redteam`.
 */

test("a refund at the authority ceiling is allowed", () => {
  assert.equal(withinAuthority({ action: "refund", amountUsd: SUPPORT_POLICY.refund_authority_usd }), true);
});

test("a refund above the ceiling is recorded as an escalation, not a refund", () => {
  const recorded = underAuthority({ action: "refund", amountUsd: 900, rationale: "Customer asked for it." });
  assert.equal(recorded.action, "escalation");
  assert.equal(recorded.amountUsd, undefined);
  // The rewritten action must pass the check the confirm route runs, or a
  // downgraded proposal could never be confirmed.
  assert.equal(withinAuthority(recorded), true);
});

test("an escalation carries no amount and is always in policy", () => {
  assert.equal(withinAuthority({ action: "escalation" }), true);
});

test("a negative or non-finite amount is outside authority", () => {
  assert.equal(withinAuthority({ action: "refund", amountUsd: Number.NaN }), false);
  assert.equal(withinAuthority({ action: "refund", amountUsd: -5 }), false);
});

test("learning retrieval returns canonical Lab 3 for tool-use questions", () => {
  const matches = findJourney("When should I use tool use in an agent?");
  assert.equal(matches.some((item) => item.id === "lab-3"), true);
});

test("every course link is absolute, so it works from the shop as well as the course", () => {
  // A relative /docs/... href is correct on the course site and a 404 on the
  // storefront, and the assistant answers on both.
  assert.equal(JOURNEY.length > 0, true);
  for (const item of JOURNEY) {
    assert.equal(item.href.startsWith("http"), true, `${item.id} href is not absolute: ${item.href}`);
    assert.equal(item.href.includes("/docs/"), true, `${item.id} href is not a docs path: ${item.href}`);
  }
});
