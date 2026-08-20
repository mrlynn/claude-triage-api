/**
 * Deterministic triage scoring — the half of the eval that gates CI.
 *
 * Extracted from run-eval.ts so three callers can share one scorer:
 *   evals/quick.ts          the Lab 0 scoreboard (fast, no judge)
 *   evals/run-eval.ts       the full run (scoring + LLM judge)
 *   evals/compare-models.ts the Lab 7 tier matrix (same cases, many models)
 *
 * TEACHING NOTE: this scores four fields with `!==` and nothing else.
 * `sentiment` and `summary` come back on every response and are scored by
 * NOTHING — that is deliberate, not an oversight. A free-text summary has no
 * single right answer, so any automated check on it would measure string
 * similarity rather than correctness. Lab 0 Step 5 asks you to defend that
 * choice, and Lab 6 shows what it costs you.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../../src/server.js";
import type { TriageResult } from "../../src/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface EvalCase {
  id: string;
  message: string;
  expected: {
    category: string;
    urgency: string;
    requires_human: boolean;
    requested_remedy: string;
  };
  /**
   * Which rule this case tests. Printed under a failure so the next person can
   * tell a real regression from a disagreement about labels — remember that
   * the first run of this dataset scored 58% and five of six failures were
   * LABEL errors, not model errors.
   */
  notes: string;
}

export interface CaseResult {
  id: string;
  /** Which model produced this result. Set by the caller's request. */
  model: string;
  passed: boolean;
  failures: string[];
  confidence: number;
  cost_usd: number;
  latency_ms: number;
  notes: string;
}

export interface ScoreOpts {
  /** Overrides the server default. Lab 7 sweeps this. */
  model?: string;
  /** Defaults to the full checked-in dataset. */
  cases?: EvalCase[];
}

export function loadCases(file = "dataset.jsonl"): EvalCase[] {
  return readFileSync(join(here, "..", file), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as EvalCase);
}

export async function scoreTriage(opts: ScoreOpts = {}): Promise<CaseResult[]> {
  const cases = opts.cases ?? loadCases();
  const results: CaseResult[] = [];

  for (const testCase of cases) {
    const started = Date.now();
    const res = await app.request("/v1/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: testCase.message }),
    });

    if (!res.ok) {
      // A transport failure is a FAILING case, not a skipped one. Dropping it
      // would quietly shrink the denominator and inflate the accuracy.
      results.push({
        id: testCase.id,
        model: opts.model ?? "unknown",
        passed: false,
        failures: [`HTTP ${res.status}: ${await res.text()}`],
        confidence: 0,
        cost_usd: 0,
        latency_ms: Date.now() - started,
        notes: testCase.notes,
      });
      continue;
    }

    const body = (await res.json()) as {
      triage: TriageResult;
      meta: { model: string; usage: { estimated_cost_usd: number } };
    };
    const got = body.triage;
    const want = testCase.expected;
    const failures: string[] = [];

    if (got.category !== want.category) {
      failures.push(`category: expected ${want.category}, got ${got.category}`);
    }
    if (got.urgency !== want.urgency) {
      failures.push(`urgency: expected ${want.urgency}, got ${got.urgency}`);
    }
    if (got.requires_human !== want.requires_human) {
      failures.push(
        `requires_human: expected ${want.requires_human}, got ${got.requires_human}`,
      );
    }
    if (got.entities.requested_remedy !== want.requested_remedy) {
      failures.push(
        `requested_remedy: expected ${want.requested_remedy}, got ${got.entities.requested_remedy}`,
      );
    }

    results.push({
      id: testCase.id,
      model: body.meta.model,
      passed: failures.length === 0,
      failures,
      confidence: got.confidence,
      cost_usd: body.meta.usage.estimated_cost_usd,
      latency_ms: Date.now() - started,
      notes: testCase.notes,
    });
  }

  return results;
}

/** Accuracy as a 0–1 fraction. Empty input scores 0, never NaN. */
export function accuracyOf(results: CaseResult[]): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.passed).length / results.length;
}

/**
 * Mean confidence on passes vs. failures.
 *
 * The GAP is the signal, not either number. A model that reports 0.9 on
 * everything cannot support threshold routing; one that is unsure exactly
 * where it is wrong can.
 *
 * `onFail` and `gap` are NULL when nothing failed, and that is not pedantry.
 * An earlier version averaged the empty set to 0, so a model that scored 12/12
 * reported a gap of 0.88 — its mean pass confidence, dressed up as separation
 * it had never demonstrated. The best-looking number in the table was the one
 * backed by no evidence at all. A metric with no data should say so.
 */
export function calibrationOf(results: CaseResult[]): {
  onPass: number | null;
  onFail: number | null;
  gap: number | null;
} {
  const mean = (xs: number[]) =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
  const onPass = mean(results.filter((r) => r.passed).map((r) => r.confidence));
  const onFail = mean(results.filter((r) => !r.passed).map((r) => r.confidence));
  return {
    onPass,
    onFail,
    gap: onPass !== null && onFail !== null ? onPass - onFail : null,
  };
}

/** Renders a possibly-absent metric. "n/a" beats a fabricated 0.00. */
export function fmtMetric(v: number | null, digits = 2): string {
  return v === null ? "n/a" : v.toFixed(digits);
}
