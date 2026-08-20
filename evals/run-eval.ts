/**
 * Eval harness.
 *
 * Two kinds of measurement, because they answer different questions:
 *
 *   1. DETERMINISTIC SCORING (the triage set). Category, urgency, escalation,
 *      and remedy are compared against a hand-labelled gold set. Cheap, fast,
 *      and the only thing you should gate a deploy on.
 *
 *   2. LLM-AS-JUDGE (the draft set). Tone compliance has no exact answer, so a
 *      second Claude call scores the reply against the handbook's tone rules
 *      with a rubric and a required rationale.
 *
 * TEACHING NOTE on judges — three rules that separate a useful judge from a
 * rubber stamp:
 *   - Give it a RUBRIC with concrete pass/fail criteria, not "rate 1-10".
 *   - Make it cite evidence BEFORE it scores. A judge that scores first
 *      rationalizes afterwards.
 *   - Never let the judge see the generating model's reasoning, and never
 *      judge with the same prompt that generated. You are measuring the
 *      output, not re-running the author.
 *
 * Run with:  npm run eval
 */
import "../src/lib/env.js";
import { assertCredentials } from "../src/anthropic.js";
import { MODEL } from "../src/config.js";
import { judgeDrafts, JUDGE_MODEL, judgePromptSha } from "./lib/judge.js";
import {
  loadCases,
  scoreTriage,
  accuracyOf,
  calibrationOf,
  fmtMetric,
  type EvalCase,
} from "./lib/score.js";

const cases: EvalCase[] = loadCases();

// ---------------------------------------------------------------------------

async function main() {
  assertCredentials();

  console.log(`\nTriage accuracy — ${cases.length} cases, model ${MODEL}\n`);
  const triageResults = await scoreTriage({ model: MODEL });

  for (const r of triageResults) {
    const mark = r.passed ? "PASS" : "FAIL";
    console.log(
      `  ${mark}  ${r.id}  conf=${r.confidence.toFixed(2)}  ${r.latency_ms}ms  $${r.cost_usd.toFixed(4)}`,
    );
    for (const f of r.failures) console.log(`          - ${f}`);
    // The case's own note, on failure only. Check the LABEL before the model:
    // the first run of this dataset scored 58% and five of the six failures
    // were mislabelled cases, not model errors.
    if (!r.passed) console.log(`          note: ${r.notes}`);
  }

  const passed = triageResults.filter((r) => r.passed).length;
  const accuracy = accuracyOf(triageResults);
  const triageCost = triageResults.reduce((a, r) => a + r.cost_usd, 0);

  // Calibration: is the confidence score actually informative? If failures
  // score as confidently as passes, the field is decoration.
  const calibration = calibrationOf(triageResults);

  console.log(`\n  accuracy: ${passed}/${triageResults.length} (${(accuracy * 100).toFixed(1)}%)`);
  console.log(`  mean confidence on passes: ${fmtMetric(calibration.onPass)}`);
  console.log(`  mean confidence on fails:  ${fmtMetric(calibration.onFail)}`);
  console.log(`  calibration gap:           ${fmtMetric(calibration.gap)}`);
  console.log(`  triage cost: $${triageCost.toFixed(4)}\n`);

  // Judge a subset — judging every case doubles cost for little extra signal.
  const sample = cases.slice(0, 4);
  console.log(
    `Tone compliance (LLM judge) — ${sample.length} drafted replies\n` +
      `  judge=${JUDGE_MODEL} prompt=${judgePromptSha()} (pinned; never varies with the model under test)\n`,
  );
  const judgeResults = await judgeDrafts(sample);

  for (const r of judgeResults) {
    console.log(`  ${r.verdict.toUpperCase()}  ${r.id}`);
    if (r.broken_rules.length) console.log(`          broken: ${r.broken_rules.join(", ")}`);
    console.log(`          ${r.rationale}`);
  }

  const judgePassed = judgeResults.filter((r) => r.verdict === "pass").length;
  const judgeCost = judgeResults.reduce((a, r) => a + r.cost_usd, 0);
  console.log(`\n  tone pass rate: ${judgePassed}/${judgeResults.length}`);
  console.log(`  judge cost: $${judgeCost.toFixed(4)}`);
  console.log(`\n  total eval cost: $${(triageCost + judgeCost).toFixed(4)}\n`);

  // Non-zero exit on regression makes this usable as a CI gate.
  const THRESHOLD = 0.8;
  if (accuracy < THRESHOLD) {
    console.error(`Accuracy ${(accuracy * 100).toFixed(1)}% is below the ${THRESHOLD * 100}% gate.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
