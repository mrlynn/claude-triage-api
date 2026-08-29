/**
 * The money control, tested.
 *
 * TEACHING NOTE: Lab 8 argues that a deterministic control beats a
 * well-written instruction *because it holds by construction*. A construction
 * nobody tests is an instruction with better syntax. These are the cheapest
 * tests in the repo to write — `enforceAuthority` is a pure function of a
 * resolution and a trace — and the failure they catch is a refund going out
 * that should not have.
 *
 * What is NOT here: whether the model can be talked into anything. That is
 * `npm run eval:redteam`, it costs $0.40 and 90 seconds, and it answers a
 * different question. These run in milliseconds for free and answer "does the
 * arithmetic hold", which is the question that has a right answer.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_REFUND_LIMIT_USD,
  THIRTY_DAY_REFUND_CEILING_USD,
  enforceAuthority,
} from "./authority.js";
import type { Resolution } from "../schemas.js";
import type { ToolCallRecord } from "../tools/index.js";

function resolution(over: Partial<Resolution> = {}): Resolution {
  return {
    recommended_action: "issue_refund",
    policy_citations: ["2.7"],
    refund_amount_usd: 100,
    within_agent_authority: true,
    reasoning: "Jacket zipper failed on second wear.",
    ...over,
  };
}

/** A `lookup_customer` result as `record()` would have stored it: raw. */
function customerLookup(refunds30d: number | null, found = true): ToolCallRecord {
  return {
    tool: "lookup_customer",
    input: { email: "sam@example.com" },
    output: found
      ? { found: true, refunds_last_30d_usd: refunds30d }
      : { found: false },
    redactions: [],
    ms: 3,
  };
}

test("a refund exactly at the ceiling is allowed", () => {
  // Off-by-one on a money limit is the classic version of this bug, and the
  // handbook says "up to $200", not "under $200".
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: AGENT_REFUND_LIMIT_USD }),
    [customerLookup(0)],
  );
  assert.equal(verdict.allowed, true);
  assert.deepEqual(verdict.violations, []);
});

test("a refund one cent over the ceiling is not", () => {
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: AGENT_REFUND_LIMIT_USD + 0.01 }),
    [customerLookup(0)],
  );
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_exceeds_agent_authority"));
});

test("a blocked resolution comes back escalated, not merely flagged", () => {
  // The route returns `verdict.corrected` and nothing else. If this invariant
  // breaks, every caller silently starts acting on the model's original
  // recommendation while the violations sit in a sibling field nobody reads.
  const verdict = enforceAuthority(resolution({ refund_amount_usd: 900 }), [
    customerLookup(0),
  ]);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.corrected.recommended_action, "escalate_to_supervisor");
  assert.equal(verdict.corrected.within_agent_authority, false);
  assert.match(verdict.corrected.reasoning, /^\[Automatically escalated:/);
  // The model's own account survives inside the corrected reasoning, so a
  // human reviewer can still see what it thought.
  assert.ok(verdict.corrected.reasoning.includes("Jacket zipper failed"));
});

test("an allowed resolution is returned unmodified", () => {
  const original = resolution({ refund_amount_usd: 50 });
  const verdict = enforceAuthority(original, [customerLookup(0)]);
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.corrected, original);
});

test("the model claiming authority it lacks is reported separately", () => {
  // THE MONEY MOMENT. This code describes the model's SELF-REPORT, not the
  // action, and a system whose self-reports are unreliable needs different
  // fixes from one whose actions are.
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: 900, within_agent_authority: true }),
    [customerLookup(0)],
  );
  assert.ok(verdict.violations.includes("model_claimed_authority_it_lacked"));
});

test("an honest model over the ceiling is blocked without the self-report violation", () => {
  // Same action, same block — but the model said `false`, so it did not lie.
  // Conflating the two would make the drift signal useless.
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: 900, within_agent_authority: false }),
    [customerLookup(0)],
  );
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_exceeds_agent_authority"));
  assert.equal(verdict.violations.includes("model_claimed_authority_it_lacked"), false);
});

test("the 30-day ceiling is read from the trace, not from the model's prose", () => {
  // The reasoning claims a clean history. The back office says $450. Under a
  // $200 refund that is $550 against a $500 ceiling, and the trace wins.
  const verdict = enforceAuthority(
    resolution({
      refund_amount_usd: 200,
      reasoning: "Customer has had no refunds in the last 30 days.",
    }),
    [customerLookup(450)],
  );
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_exceeds_30d_ceiling"));
});

test("cumulative spend exactly at the 30-day ceiling is allowed", () => {
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: 100 }),
    [customerLookup(THIRTY_DAY_REFUND_CEILING_USD - 100)],
  );
  assert.equal(verdict.allowed, true);
});

test("a refund with no customer lookup is a violation on its own", () => {
  // Not an oversight to log — an unverifiable refund. The absence of evidence
  // has to fail, or an agent that skips the lookup gets a free pass on the
  // ceiling it was skipping.
  const verdict = enforceAuthority(resolution({ refund_amount_usd: 50 }), []);
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_without_customer_lookup"));
});

test("a customer record that was not found does not count as zero prior refunds", () => {
  // `{found: false}` carries no `refunds_last_30d_usd`, and reading it as 0
  // would turn a failed lookup into a clean history — the most expensive
  // possible way to be wrong here.
  const verdict = enforceAuthority(resolution({ refund_amount_usd: 50 }), [
    customerLookup(null, false),
  ]);
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_without_customer_lookup"));
});

test("a refund with a null amount is blocked", () => {
  // An unbounded instruction to a downstream system, not a formatting problem.
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: null }),
    [customerLookup(0)],
  );
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_without_amount"));
});

test("non-refund actions are not subject to the refund ceilings", () => {
  // A $900 replacement jacket is a different decision under different clauses.
  // A control that fires on legitimate behaviour gets switched off.
  const verdict = enforceAuthority(
    resolution({
      recommended_action: "ship_replacement",
      refund_amount_usd: 900,
    }),
    [],
  );
  assert.equal(verdict.allowed, true);
  assert.deepEqual(verdict.violations, []);
});

test("the first usable customer lookup in the trace is the one that counts", () => {
  // A multi-turn loop can look the same customer up twice. Reading the last
  // record would let a later, emptier result overwrite a real one.
  const verdict = enforceAuthority(resolution({ refund_amount_usd: 100 }), [
    customerLookup(450),
    customerLookup(0),
  ]);
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_exceeds_30d_ceiling"));
});
