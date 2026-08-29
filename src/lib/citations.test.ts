/**
 * Citation verification, tested.
 *
 * TEACHING NOTE: the first version of this checker was wrong about the
 * architecture — it treated "cited without a matching `search_policy` call" as
 * fabrication, when the whole handbook sits in the cached system prompt and
 * the model can read clause 2.7 without ever calling the tool. It flagged four
 * real clauses on its first run (Lab 8, Step 6).
 *
 * These tests pin the distinction that correction produced, because it is the
 * kind of thing that gets quietly re-broken by someone tightening a check:
 * `unsupported` is a violation, `cited_without_search` is a signal, and they
 * are not the same question.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { verifyCitations } from "./citations.js";
import { POLICY_HANDBOOK } from "../tools/data.js";
import type { ToolCallRecord } from "../tools/index.js";

/** A clause that genuinely exists — the $200 refund authority. */
const REAL_CLAUSE = "2.7";
/** A clause number with the right shape and no referent. */
const FORGED_CLAUSE = "9.9";

function policySearch(text: string): ToolCallRecord {
  return {
    tool: "search_policy",
    input: { query: "refund authority" },
    output: text,
    redactions: [],
    ms: 5,
  };
}

test("the fixture clauses are what this file assumes", () => {
  // A test whose fixtures have drifted tests nothing. If the handbook is
  // renumbered, fail here rather than in a confusing assertion below.
  assert.ok(POLICY_HANDBOOK.includes(REAL_CLAUSE));
  assert.equal(POLICY_HANDBOOK.includes(FORGED_CLAUSE), false);
});

test("a forged clause number is reported as unsupported", () => {
  // The failure that cannot be defended under any reading, and the one that
  // reads as diligence rather than as uncertainty.
  const report = verifyCitations([FORGED_CLAUSE], [policySearch("clause 2.7 ...")]);
  assert.deepEqual(report.unsupported, [FORGED_CLAUSE]);
});

test("a real clause cited without any tool call is NOT a violation", () => {
  // THE CORRECTION. The handbook is in the cached prefix; reading it there is
  // the designed behaviour. Promoting this to a violation is what produced
  // false positives on every run.
  const report = verifyCitations([REAL_CLAUSE], []);
  assert.deepEqual(report.unsupported, []);
  assert.deepEqual(report.cited_without_search, [REAL_CLAUSE]);
  assert.equal(report.searched, false);
});

test("a real clause returned by the tool is clean on both counts", () => {
  const report = verifyCitations(
    [REAL_CLAUSE],
    [policySearch(`Clause ${REAL_CLAUSE}: agents may refund up to $200.`)],
  );
  assert.deepEqual(report.unsupported, []);
  assert.deepEqual(report.cited_without_search, []);
  assert.equal(report.searched, true);
});

test("`searched` describes the agent, not the citations", () => {
  // Reported separately because "did it look anything up" and "is this
  // citation real" are different questions, and collapsing them is exactly
  // the bug this file was built out of.
  const report = verifyCitations([], [policySearch("clause 2.7 ...")]);
  assert.equal(report.searched, true);
  assert.deepEqual(report.cited, []);
});

test("prose citation formats are normalised to bare clause numbers", () => {
  // The model may write "clause 2.7" or "§2.7" rather than a bare id, and a
  // checker that only matches one form silently passes everything.
  const report = verifyCitations(
    [`clause ${REAL_CLAUSE}`, `§${REAL_CLAUSE}`],
    [policySearch(`Clause ${REAL_CLAUSE}: ...`)],
  );
  assert.deepEqual(report.cited, [REAL_CLAUSE]);
  assert.deepEqual(report.unsupported, []);
});

test("only search_policy results count as having been read", () => {
  // A clause number that happens to appear in an order lookup is not evidence
  // the policy was consulted.
  const orderLookup: ToolCallRecord = {
    tool: "lookup_order",
    input: { order_id: "NW-48211" },
    output: { order_id: "NW-48211", total_usd: 2.7 },
    redactions: [],
    ms: 2,
  };
  const report = verifyCitations([REAL_CLAUSE], [orderLookup]);
  assert.equal(report.searched, false);
  assert.deepEqual(report.cited_without_search, [REAL_CLAUSE]);
});

test("no citations at all is not an error here", () => {
  // `provide_information` needs no clause. This checker's job is the truth of
  // what was cited, not whether anything was.
  const report = verifyCitations([], []);
  assert.deepEqual(report.cited, []);
  assert.deepEqual(report.unsupported, []);
});
