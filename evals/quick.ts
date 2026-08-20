/**
 * The scoreboard. `npm run eval:quick`
 *
 * Deterministic scoring only — no LLM judge, no drafting. About a minute and
 * ~$0.09 warm on the 12-case set. The point is not that it is cheap; it is
 * that it is DETERMINISTIC, so the same input gives the same verdict and a
 * red result names a case rather than expressing a mood.
 *
 * TEACHING NOTE (Lab 0): this exists so you have a number BEFORE you start
 * changing prompts, not after. The full `npm run eval` is the instrument you
 * reach for when you want to understand a result; this is the one you keep
 * running while you work.
 *
 * Usage:
 *   npm run eval:quick              score and compare against the baseline
 *   npm run eval:quick -- --save    write the current score as the new baseline
 *   npm run eval:quick -- --gate    exit non-zero below THRESHOLD (for CI)
 *
 * `evals/baseline.json` is CHECKED IN on purpose. Its git diff across the
 * course is the artifact: you can see, commit by commit, what each prompt
 * change actually did.
 */
import "../src/lib/env.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCredentials } from "../src/anthropic.js";
import { MODEL } from "../src/config.js";
import { scoreTriage, accuracyOf, calibrationOf, fmtMetric } from "./lib/score.js";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(here, "baseline.json");

/** The CI gate. Deliberately below 100% — see Lab 6 Q1 on eval-11. */
const THRESHOLD = 0.8;

interface Baseline {
  recorded_at: string;
  model: string;
  accuracy: number;
  passed: number;
  total: number;
  /** Which case ids passed, so a swap (one fixed, one broken) is visible. */
  passing_ids: string[];
}

function readBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

async function main(): Promise<void> {
  assertCredentials();

  const save = process.argv.includes("--save");
  const gate = process.argv.includes("--gate");

  const results = await scoreTriage({ model: MODEL });
  const accuracy = accuracyOf(results);
  const passed = results.filter((r) => r.passed).length;
  const cost = results.reduce((sum, r) => sum + r.cost_usd, 0);
  const calibration = calibrationOf(results);

  for (const r of results) {
    console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id}  conf ${r.confidence.toFixed(2)}`);
    for (const f of r.failures) console.log(`        ${f}`);
    if (!r.passed) {
      // Print the case's own note on a failure. Check the LABEL before you
      // check the model — a gold set is a spec and specs have bugs.
      console.log(`        note: ${r.notes}`);
    }
  }

  const baseline = readBaseline();
  const delta = baseline ? passed - baseline.passed : null;
  const deltaText =
    delta === null
      ? "no baseline yet"
      : `Δ ${delta > 0 ? "+" : ""}${delta} vs baseline (${baseline!.passed}/${baseline!.total})`;

  console.log(
    `\naccuracy ${passed}/${results.length} (${(accuracy * 100).toFixed(1)}%) ` +
      `· $${cost.toFixed(4)} · ${deltaText}`,
  );
  console.log(
    `confidence: ${fmtMetric(calibration.onPass)} on passes, ` +
      `${fmtMetric(calibration.onFail)} on failures ` +
      `(gap ${fmtMetric(calibration.gap)} — the gap is the signal)` +
      (calibration.gap === null
        ? "\n  no failures this run, so there is no gap to measure — not a perfect score for calibration"
        : ""),
  );

  // A same-count change can still be a real change. Name the cases that moved.
  if (baseline) {
    const nowPassing = new Set(results.filter((r) => r.passed).map((r) => r.id));
    const wasPassing = new Set(baseline.passing_ids);
    const broke = [...wasPassing].filter((id) => !nowPassing.has(id));
    const fixed = [...nowPassing].filter((id) => !wasPassing.has(id));
    if (broke.length) console.log(`regressed: ${broke.join(", ")}`);
    if (fixed.length) console.log(`newly passing: ${fixed.join(", ")}`);
    if (broke.length || fixed.length) {
      // Measured spread on this set is two cases run-to-run with nothing
      // changed, so a delta of 1-2 is not by itself evidence. The case IDS
      // are the signal; the count is not.
      console.log(
        `  (this set moves by up to 2 cases run-to-run on its own — read the ` +
          `case ids, not the delta)`,
      );
    }
    if (baseline.model !== MODEL) {
      console.log(
        `WARNING: baseline was recorded on ${baseline.model}, this run used ${MODEL}. ` +
          `That delta measures the model, not your change.`,
      );
    }
  }

  if (save) {
    const next: Baseline = {
      recorded_at: new Date().toISOString(),
      model: MODEL,
      accuracy,
      passed,
      total: results.length,
      passing_ids: results.filter((r) => r.passed).map((r) => r.id),
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nbaseline updated: ${BASELINE_PATH}`);
  }

  if (gate && accuracy < THRESHOLD) {
    console.error(
      `\nGATE FAILED: ${(accuracy * 100).toFixed(1)}% is below the ${THRESHOLD * 100}% threshold.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
