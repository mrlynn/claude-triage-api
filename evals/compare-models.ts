/**
 * The tier matrix. `npm run eval:models`
 *
 * Runs the same gold set against several models and prints a table you can
 * make a decision from, plus a disagreement matrix showing WHICH cases each
 * model loses. The second thing matters more than the first: "Haiku scores
 * 11/12" tells you almost nothing, while "Haiku loses exactly the business-day
 * case" tells you whether to ship it.
 *
 * TEACHING NOTE — three disciplines this run enforces, all of which are easy
 * to skip and each of which invalidates the comparison when skipped:
 *
 *   1. THE JUDGE IS PINNED. `JUDGE_MODEL` never inherits `--models`. Vary the
 *      ruler and the thing being measured at once and a moved number has two
 *      possible causes. The judge id and a hash of its prompt are printed and
 *      stored with every result.
 *
 *   2. EFFORT IS REPORTED, NOT ASSUMED. Haiku 4.5 rejects
 *      `output_config.effort` with a 400, so `buildTriageRequest` drops it.
 *      That means the cheap tier is running at a DIFFERENT setting from the
 *      others, and a table that hid this would be comparing low-effort Opus
 *      against no-effort Haiku while implying they were like for like.
 *
 *   3. COST IS PROJECTED TO THE REAL WORKLOAD. A twelve-case total is an
 *      abstraction. 4,100 tickets a week against Priya's $4,000/month budget
 *      is the number that decides anything.
 *
 * Usage:
 *   npm run eval:models
 *   npm run eval:models -- --models claude-opus-5,claude-haiku-4-5
 *   npm run eval:models -- --concurrency 4 --judge-sample 4
 *   npm run eval:models -- --no-judge          skip tone judging entirely
 */
import "../src/lib/env.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCredentials } from "../src/anthropic.js";
import { MODEL_TIERS, specFor } from "../src/config.js";
import { mapWithConcurrency } from "../src/lib/pool.js";
import { app } from "../src/server.js";
import type { TriageResult } from "../src/schemas.js";
import {
  loadCases,
  accuracyOf,
  calibrationOf,
  fmtMetric,
  type EvalCase,
  type CaseResult,
} from "./lib/score.js";
import { judgeDrafts, JUDGE_MODEL, judgePromptSha } from "./lib/judge.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Northwind's actual load. Every projection below is anchored to it. */
const TICKETS_PER_WEEK = 4_100;
const MONTHLY_BUDGET = 4_000;

interface ModelRun {
  model: string;
  effort_applied: boolean;
  results: CaseResult[];
  accuracy: number;
  calibration: { onPass: number | null; onFail: number | null; gap: number | null };
  latency_p50: number;
  latency_p95: number;
  cost_set: number;
  cost_per_ticket: number;
  monthly_projection: number;
}

interface JudgeControl {
  passed: number;
  total: number;
  cost: number;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

/**
 * Scores one model over the case set, `limit` cases in flight.
 *
 * This does NOT reuse `scoreTriage` from lib/score.ts, because that helper
 * deliberately posts without a model override so the route's own default
 * applies. Here the model is the independent variable, so it goes on the wire
 * as a query param — the same `?tier` / model plumbing the route exposes.
 */
async function runModel(
  model: string,
  cases: EvalCase[],
  limit: number,
): Promise<CaseResult[]> {
  return mapWithConcurrency(cases, limit, async (testCase) => {
    const started = Date.now();
    const res = await app.request(`/v1/triage?model=${encodeURIComponent(model)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: testCase.message }),
    });

    if (!res.ok) {
      // A model that cannot serve the request is a FAILING model, not an
      // absent row. Silently dropping it would flatter whichever tier broke.
      return {
        id: testCase.id,
        model,
        passed: false,
        failures: [`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`],
        confidence: 0,
        cost_usd: 0,
        latency_ms: Date.now() - started,
        notes: testCase.notes,
      } satisfies CaseResult;
    }

    const body = (await res.json()) as {
      triage: TriageResult;
      meta: { model: string; usage: { estimated_cost_usd: number } };
    };
    const got = body.triage;
    const want = testCase.expected;
    const failures: string[] = [];

    if (got.category !== want.category) failures.push(`category: want ${want.category}, got ${got.category}`);
    if (got.urgency !== want.urgency) failures.push(`urgency: want ${want.urgency}, got ${got.urgency}`);
    if (got.requires_human !== want.requires_human) {
      failures.push(`requires_human: want ${want.requires_human}, got ${got.requires_human}`);
    }
    if (got.entities.requested_remedy !== want.requested_remedy) {
      failures.push(`remedy: want ${want.requested_remedy}, got ${got.entities.requested_remedy}`);
    }

    return {
      id: testCase.id,
      model: body.meta.model,
      passed: failures.length === 0,
      failures,
      confidence: got.confidence,
      cost_usd: body.meta.usage.estimated_cost_usd,
      latency_ms: Date.now() - started,
      notes: testCase.notes,
    } satisfies CaseResult;
  });
}

function renderTable(runs: ModelRun[]): string {
  const head =
    "| model | effort | accuracy | p50 | p95 | $/set | $/ticket | $/mo @ 4,100/wk | conf pass | conf fail | gap |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|";
  const rows = runs.map((r) => {
    const budget = r.monthly_projection <= MONTHLY_BUDGET ? "" : " ⚠";
    return (
      `| \`${r.model}\` | ${r.effort_applied ? "low" : "n/a"} ` +
      `| ${r.results.filter((x) => x.passed).length}/${r.results.length} (${(r.accuracy * 100).toFixed(0)}%) ` +
      `| ${r.latency_p50}ms | ${r.latency_p95}ms ` +
      `| $${r.cost_set.toFixed(4)} | $${r.cost_per_ticket.toFixed(5)} ` +
      `| $${r.monthly_projection.toFixed(0)}${budget} ` +
      `| ${fmtMetric(r.calibration.onPass)} | ${fmtMetric(r.calibration.onFail)} | ${fmtMetric(r.calibration.gap)} |`
    );
  });
  return [head, sep, ...rows].join("\n");
}

/**
 * Which cases each model loses.
 *
 * The single most useful output here. An aggregate score hides the shape of
 * the disagreement; this shows whether the cheap tier fails the same cases the
 * flagship fails (in which case the gold set is the problem) or different ones
 * (in which case the model is).
 */
function renderMatrix(runs: ModelRun[], cases: EvalCase[]): string {
  const short = (m: string) => m.replace("claude-", "").replace(/-\d+$/, "");
  const head = `| case | ${runs.map((r) => short(r.model)).join(" | ")} | note |`;
  const sep = `|---|${runs.map(() => "---").join("|")}|---|`;
  const rows = cases.map((c, i) => {
    const marks = runs.map((r) => (r.results[i]?.passed ? "·" : "**X**"));
    const contested = marks.some((m) => m === "**X**") && marks.some((m) => m === "·");
    const note = contested ? c.notes.slice(0, 70) : "";
    return `| ${c.id} | ${marks.join(" | ")} | ${note} |`;
  });
  return [head, sep, ...rows].join("\n");
}

async function main(): Promise<void> {
  assertCredentials();

  const models = arg("models", Object.values(MODEL_TIERS).join(",")).split(",").map((m) => m.trim());
  const limit = Number(arg("concurrency", "4"));
  const judgeSample = Number(arg("judge-sample", "4"));
  const skipJudge = process.argv.includes("--no-judge");
  const cases = loadCases();

  console.log(`\nTier matrix — ${cases.length} cases × ${models.length} models, ${limit} in flight`);
  console.log(`judge=${JUDGE_MODEL} prompt=${judgePromptSha()} (PINNED — does not vary with the model under test)\n`);

  const runs: ModelRun[] = [];

  // Models run SEQUENTIALLY; cases within a model run concurrently. Running
  // everything at once would put three models' traffic against one rate limit
  // and make the latency column measure contention rather than the model.
  for (const model of models) {
    const spec = specFor(model);
    process.stdout.write(`  ${model} ... `);
    const started = Date.now();
    const results = await runModel(model, cases, limit);
    const latencies = results.map((r) => r.latency_ms);
    const costSet = results.reduce((a, r) => a + r.cost_usd, 0);
    const costPerTicket = costSet / results.length;

    runs.push({
      model,
      effort_applied: spec.supportsEffort,
      results,
      accuracy: accuracyOf(results),
      calibration: calibrationOf(results),
      latency_p50: Math.round(percentile(latencies, 50)),
      latency_p95: Math.round(percentile(latencies, 95)),
      cost_set: costSet,
      cost_per_ticket: costPerTicket,
      monthly_projection: costPerTicket * TICKETS_PER_WEEK * (52 / 12),
    });
    console.log(`${Math.round((Date.now() - started) / 1000)}s`);
  }

  // The tone judge runs ONCE, not per model, and that is deliberate.
  // judgeDrafts generates through /v1/draft, which uses the SERVER's model —
  // not the model under test. Running it inside the per-model loop would have
  // billed three times to measure the same drafter three times, and printing
  // the result in a per-tier column would have implied a comparison that was
  // never made. It is a control: it tells you the drafter did not drift while
  // the sweep ran, and nothing about the tiers.
  let judgeControl: JudgeControl | null = null;
  if (!skipJudge) {
    const judged = await judgeDrafts(cases.slice(0, judgeSample));
    judgeControl = {
      passed: judged.filter((j) => j.verdict === "pass").length,
      total: judged.length,
      cost: judged.reduce((a, j) => a + j.cost_usd, 0),
    };
  }

  console.log(`\n${renderTable(runs)}\n`);
  if (judgeControl) {
    console.log(
      `Tone control (drafter held constant, NOT per tier): ` +
        `${judgeControl.passed}/${judgeControl.total} — and remember this judge ` +
        `has swung 1/4 to 3/4 on identical input.\n`,
    );
  }
  console.log(`Disagreement matrix (· pass, X fail):\n`);
  console.log(`${renderMatrix(runs, cases)}\n`);

  for (const r of runs) {
    if (!r.effort_applied) {
      console.log(
        `NOTE: ${r.model} does not accept output_config.effort, so it ran with the\n` +
          `      parameter dropped. It is not running "low effort" — it is running\n` +
          `      NO effort setting, which is a different thing from the other rows.`,
      );
    }
  }

  const outDir = join(here, "results");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = join(outDir, `models-${stamp}.json`);
  writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        recorded_at: new Date().toISOString(),
        judge_model: JUDGE_MODEL,
        judge_prompt_sha: judgePromptSha(),
        tickets_per_week: TICKETS_PER_WEEK,
        monthly_budget: MONTHLY_BUDGET,
        judge_control: judgeControl,
        runs,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`written: ${outFile}`);

  // --emit-site reduces the run to the shape the course-site component reads
  // and writes it to a CHECKED-IN path. Doing it here rather than by hand
  // means the number on the website is traceable to a command anyone can
  // re-run, which is the same reason evals/baseline.json is committed.
  if (process.argv.includes("--emit-site")) {
    const sitePath = join(here, "..", "website", "src", "data", "model-matrix.json");
    writeFileSync(
      sitePath,
      `${JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          generated_by: "npm run eval:models -- --emit-site",
          judge_model: JUDGE_MODEL,
          judge_prompt_sha: judgePromptSha(),
          tickets_per_week: TICKETS_PER_WEEK,
          monthly_budget: MONTHLY_BUDGET,
          caveat:
            "One run. This set moves by up to two cases run-to-run with nothing " +
            "changed, so read the disagreement matrix and the calibration gap, " +
            "not the accuracy column.",
          cases: cases.map((c) => ({ id: c.id, notes: c.notes })),
          models: runs.map((r) => ({
            model: r.model,
            effort_applied: r.effort_applied,
            accuracy: r.accuracy,
            passed: r.results.filter((x) => x.passed).length,
            total: r.results.length,
            latency_p50: r.latency_p50,
            latency_p95: r.latency_p95,
            cost_per_ticket: r.cost_per_ticket,
            monthly_projection: r.monthly_projection,
            calibration: r.calibration,
            per_case: r.results.map((x) => ({ id: x.id, passed: x.passed, confidence: x.confidence })),
          })),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`written: ${sitePath}`);
  }
  console.log(
    `\nTotal spend this run: $${(
      runs.reduce((a, r) => a + r.cost_set, 0) + (judgeControl?.cost ?? 0)
    ).toFixed(4)}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
