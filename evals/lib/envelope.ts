/**
 * The cross-runtime comparison envelope.
 *
 * This file is DUPLICATED, near-identically, in
 * https://github.com/mrlynn/cursor-triage-api at the same path. That is
 * deliberate and it is the same trade the guardrail code makes (see
 * CLAUDE.md): two teaching repos that must not depend on each other at
 * runtime, because the whole point of the comparison is that each side runs
 * on its own SDK, its own key, and its own process. A shared npm package
 * would make "they agree" an artifact of shared code rather than a finding.
 *
 * The cost of that trade is drift. `ENVELOPE_VERSION` is how drift becomes
 * loud instead of silent: the report refuses to merge envelopes that disagree
 * on it, rather than rendering a table whose columns mean different things on
 * different rows.
 *
 * WHY AN ENVELOPE AT ALL, rather than one script that calls both services:
 * one process holding both SDKs would share a Node event loop, a DNS cache
 * and a machine, and the latency column — the headline number — would be
 * measuring contention between the two clients. Each repo produces its own
 * envelope from its own run. `compare-report.ts` stitches them by case id
 * afterwards and never makes a network call.
 */

/** Bump when a field changes meaning. The report hard-fails on a mismatch. */
export const ENVELOPE_VERSION = 1;

/**
 * The cases both repos run.
 *
 * The Claude twin carries twelve; the Cursor twin carries these three,
 * byte-identical in `message` and `expected`. Three is not a sampling
 * decision — a Cursor agent run is a full agent loop, and a twelve-case
 * sweep is the wrong first instrument against it. Read the disagreement
 * matrix here, not the accuracy percentage: three cases cannot support a
 * percentage worth quoting, and the report says so in its own output.
 *
 * eval-01 clean defect · eval-04 safety escalation · eval-05 positive/no-action
 */
export const COMPARISON_CASE_IDS = ["eval-01", "eval-04", "eval-05"] as const;

/** How many times the whole set runs. Latency needs more than three samples. */
export const DEFAULT_REPEATS = 3;

/** Northwind's actual load. Every projection is anchored to it. */
export const TICKETS_PER_WEEK = 4_100;
export const MONTHLY_BUDGET = 4_000;

export interface EnvelopeCase {
  id: string;
  /** Which repetition of the set this row came from, 1-indexed. */
  repeat: number;
  model: string | null;
  /**
   * Three outcomes, not two. `unparseable` is the case where the service got
   * a response and could not turn it into a TriageResult at all — which is a
   * different failure from a well-formed wrong answer, and is the single
   * sharpest structural difference between the two runtimes. Collapsing it
   * into `passed: false` would delete the finding.
   */
  outcome: "pass" | "fail" | "unparseable" | "transport_error";
  failures: string[];
  confidence: number | null;
  latency_ms: number;
  total_tokens: number | null;
  /** Null where the runtime cannot price a call. See `not_available`. */
  cost_usd: number | null;
  notes: string;
}

export interface EnvelopeMetrics {
  passed: number;
  failed: number;
  unparseable: number;
  transport_errors: number;
  total: number;
  /** passes / total. Unparseable rows are in the denominator, never dropped. */
  accuracy: number;
  /**
   * Responses that became a valid TriageResult, over responses received.
   * Structurally 1.0 where the API constrains generation to the schema. That
   * asymmetry is the lesson; a table that hid it would be the wrong table.
   */
  schema_adherence: number;
  schema_enforcement: string;
  latency_ms: { p50: number; p95: number; mean: number; samples: number };
  calibration: { onPass: number | null; onFail: number | null; gap: number | null };
  cost: EnvelopeCost | null;
}

export interface EnvelopeCost {
  /**
   * How this number was arrived at. The report prints this next to every
   * cost figure and REFUSES to compare figures across differing bases.
   * An estimate off a checked-in price table and a settled invoice from a
   * usage API are not the same kind of number, and subtracting one from the
   * other produces a slide nobody should trust.
   */
  basis: string;
  currency: "USD";
  per_case: number;
  per_ticket: number;
  monthly_projection: number;
  within_budget: boolean;
}

export interface ComparisonEnvelope {
  envelope_version: number;
  /** Stable key for the column this becomes in the report. */
  runtime: string;
  runtime_label: string;
  repo: string;
  recorded_at: string;
  /** The exact command that produced this file. Reproducibility or nothing. */
  command: string;
  sdk: { name: string; version: string };
  node_version: string;
  model: string | null;
  case_set: string;
  repeats: number;
  cases: EnvelopeCase[];
  metrics: EnvelopeMetrics;
  /**
   * Capabilities this runtime does not have, mapped to WHY.
   *
   * The most valuable field in the envelope. A comparison table with honest
   * holes teaches more than one padded into false parity, and the reason
   * string is what stops a reader concluding "nobody measured it" when the
   * truth is "this API does not expose it".
   *
   * Both sides carry entries. Neither column is expected to be empty.
   */
  not_available: Record<string, string>;
}

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Calibration over envelope rows.
 *
 * `onFail` and `gap` are NULL when nothing failed. See the long note on
 * `calibrationOf` in lib/score.ts: averaging the empty set to 0 once made a
 * perfect run report separation it had never demonstrated.
 */
export function calibrationOfCases(cases: EnvelopeCase[]): EnvelopeMetrics["calibration"] {
  const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
  const conf = (c: EnvelopeCase) => c.confidence;
  const onPass = avg(cases.filter((c) => c.outcome === "pass").map(conf).filter((n): n is number => n !== null));
  const onFail = avg(cases.filter((c) => c.outcome === "fail").map(conf).filter((n): n is number => n !== null));
  return { onPass, onFail, gap: onPass !== null && onFail !== null ? onPass - onFail : null };
}

export function metricsFor(
  cases: EnvelopeCase[],
  opts: { schema_enforcement: string; cost: EnvelopeCost | null },
): EnvelopeMetrics {
  const passed = cases.filter((c) => c.outcome === "pass").length;
  const failed = cases.filter((c) => c.outcome === "fail").length;
  const unparseable = cases.filter((c) => c.outcome === "unparseable").length;
  const transport = cases.filter((c) => c.outcome === "transport_error").length;
  const latencies = cases.map((c) => c.latency_ms);
  // Transport errors are excluded from the adherence denominator because no
  // response arrived to adhere to anything. They stay in `accuracy`, where a
  // request the service could not serve is a request it did not get right.
  const responded = cases.length - transport;

  return {
    passed,
    failed,
    unparseable,
    transport_errors: transport,
    total: cases.length,
    accuracy: cases.length === 0 ? 0 : passed / cases.length,
    schema_adherence: responded === 0 ? 0 : (responded - unparseable) / responded,
    schema_enforcement: opts.schema_enforcement,
    latency_ms: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      mean: Math.round(mean(latencies)),
      samples: latencies.length,
    },
    calibration: calibrationOfCases(cases),
    cost: opts.cost,
  };
}

export function projectCost(
  perCase: number,
  basis: string,
): EnvelopeCost {
  const monthly = perCase * TICKETS_PER_WEEK * (52 / 12);
  return {
    basis,
    currency: "USD",
    per_case: perCase,
    per_ticket: perCase,
    monthly_projection: monthly,
    within_budget: monthly <= MONTHLY_BUDGET,
  };
}

/** Renders a possibly-absent metric. "n/a" beats a fabricated 0.00. */
export function fmtOrNa(v: number | null, digits = 2): string {
  return v === null ? "n/a" : v.toFixed(digits);
}
