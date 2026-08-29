/**
 * The Claude side of the cross-runtime comparison. `npm run eval:compare`
 *
 * Runs the three shared cases against this repo's /v1/triage and writes a
 * comparison envelope. The Cursor twin runs the identical command against
 * its own service and writes its own envelope. Neither knows about the
 * other. `npm run eval:compare:report -- <a.json> <b.json>` merges them.
 *
 * TEACHING NOTE — four disciplines this run enforces. Each one is easy to
 * skip, and each one invalidates the comparison when skipped:
 *
 *   1. CASES RUN SEQUENTIALLY. compare-models.ts puts four cases in flight
 *      because there the model is the variable and latency is a side column.
 *      Here LATENCY IS THE HEADLINE — one Messages call against a full agent
 *      loop — so anything in flight beside it turns that column into a
 *      measurement of contention. Slower run, honest number.
 *
 *   2. THE SET REPEATS. Three cases give a p95 drawn from three samples,
 *      which is not a p95. --repeats 3 is the floor, and the sample count
 *      is written into the envelope so a reader can discount it themselves.
 *
 *   3. UNPARSEABLE IS NOT "WRONG". A 502 unparseable_output means the schema
 *      was not honoured at all; a wrong category means it was honoured and
 *      the answer was bad. On this runtime output_config.format makes the
 *      first one structurally near-impossible, which is precisely the finding
 *      the Cursor column exists to contrast with. Collapsing them into one
 *      pass/fail bit deletes it.
 *
 *   4. COST CARRIES ITS BASIS. The number below is derived from the price
 *      table in src/config.ts, not from an invoice. It is written into the
 *      envelope as `basis`, the report prints it under every dollar figure,
 *      and the report REFUSES to difference two costs whose bases differ.
 *      Cursor bills through a usage API in cents; multiplying Claude's
 *      $/MTok onto Cursor tokens would produce a confident, invented number.
 *
 * Usage:
 *   npm run eval:compare
 *   npm run eval:compare -- --repeats 5
 *   npm run eval:compare -- --model claude-haiku-4-5
 */
import "../src/lib/env.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCredentials } from "../src/anthropic.js";
import { MODEL } from "../src/config.js";
import { app } from "../src/server.js";
import type { TriageResult } from "../src/schemas.js";
import { loadCases } from "./lib/score.js";
import {
  COMPARISON_CASE_IDS,
  DEFAULT_REPEATS,
  ENVELOPE_VERSION,
  metricsFor,
  projectCost,
  type ComparisonEnvelope,
  type EnvelopeCase,
} from "./lib/envelope.js";

const here = dirname(fileURLToPath(import.meta.url));

const RUNTIME = "claude-messages";
const RUNTIME_LABEL = "Claude Messages API";
const REPO = "https://github.com/mrlynn/claude-triage-api";

/**
 * What this runtime cannot do, and why.
 *
 * The second entry is not filler and it is not false modesty. A comparison
 * that never concedes is a comparison nobody believes, and the places the
 * Cursor primitive genuinely wins are real: a workspace, a shell, repo edits,
 * a PR. If this map is ever empty, the table has stopped being evidence and
 * started being marketing.
 */
const NOT_AVAILABLE: Record<string, string> = {
  billed_cost_actual:
    "Cost here is ESTIMATED from the list-price table in src/config.ts, not read " +
    "from an invoice. It is reproducible and it is not settled billing.",
  agent_workspace:
    "A Messages call has no workspace, shell, filesystem or repo. Work that needs " +
    "the model to edit code and open a PR is not a job this runtime can do at all, " +
    "which is the half of the comparison the Cursor twin wins outright.",
  run_resumption:
    "There is no Run object to re-attach to. A dropped connection loses the call; " +
    "an agent run has an id you can come back to.",
};

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

function sdkVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return String(pkg.dependencies?.["@anthropic-ai/sdk"] ?? "unknown");
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  assertCredentials();

  const repeats = Math.max(1, Number(arg("repeats", String(DEFAULT_REPEATS))));
  const model = arg("model", MODEL);
  const all = loadCases();
  const cases = COMPARISON_CASE_IDS.map((id) => {
    const found = all.find((c) => c.id === id);
    // A missing shared case is fatal, not skippable. Quietly running two of
    // three would produce an envelope the report happily merges against a
    // three-case Cursor run, comparing different work under one heading.
    if (!found) throw new Error(`Comparison case ${id} is not in evals/dataset.jsonl.`);
    return found;
  });

  console.log(`\n${RUNTIME_LABEL} — ${cases.length} shared cases × ${repeats} repeats, sequential`);
  console.log(`model=${model}  (latency is the measured variable; nothing runs in parallel)\n`);

  const rows: EnvelopeCase[] = [];

  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    for (const testCase of cases) {
      const started = Date.now();
      const res = await app.request(`/v1/triage?model=${encodeURIComponent(model)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testCase.message }),
      });
      const latency = Date.now() - started;

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // 502 unparseable_output is the schema-adherence miss. Every other
        // non-2xx is a transport-or-config failure and is counted apart from
        // it, because "the API refused the request" and "the model ignored
        // the schema" answer different questions.
        const unparseable = res.status === 502 && body.error === "unparseable_output";
        rows.push({
          id: testCase.id,
          repeat,
          model,
          outcome: unparseable ? "unparseable" : "transport_error",
          failures: [`HTTP ${res.status}: ${body.error ?? "unknown"}`],
          confidence: null,
          latency_ms: latency,
          total_tokens: null,
          cost_usd: null,
          notes: testCase.notes,
        });
        console.log(`  ${unparseable ? "UNPARSEABLE" : "ERROR"}  ${testCase.id}  r${repeat}  ${latency}ms`);
        continue;
      }

      const body = (await res.json()) as {
        triage: TriageResult;
        meta: { model: string; usage: { total_input_tokens: number; output_tokens: number; estimated_cost_usd: number } };
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

      rows.push({
        id: testCase.id,
        repeat,
        model: body.meta.model,
        outcome: failures.length === 0 ? "pass" : "fail",
        failures,
        confidence: got.confidence,
        latency_ms: latency,
        total_tokens: body.meta.usage.total_input_tokens + body.meta.usage.output_tokens,
        cost_usd: body.meta.usage.estimated_cost_usd,
        notes: testCase.notes,
      });

      console.log(
        `  ${failures.length === 0 ? "PASS" : "FAIL"}  ${testCase.id}  r${repeat}  ` +
          `conf ${got.confidence.toFixed(2)}  ${latency}ms  $${body.meta.usage.estimated_cost_usd.toFixed(5)}`,
      );
      for (const f of failures) console.log(`        ${f}`);
    }
  }

  const priced = rows.map((r) => r.cost_usd).filter((n): n is number => n !== null);
  const cost = priced.length
    ? projectCost(
        priced.reduce((a, b) => a + b, 0) / priced.length,
        "estimated from the list-price table in src/config.ts (NOT settled billing)",
      )
    : null;

  const metrics = metricsFor(rows, {
    schema_enforcement: "api_constrained_output_config_format",
    cost,
  });

  const envelope: ComparisonEnvelope = {
    envelope_version: ENVELOPE_VERSION,
    runtime: RUNTIME,
    runtime_label: RUNTIME_LABEL,
    repo: REPO,
    recorded_at: new Date().toISOString(),
    command: `npm run eval:compare -- --repeats ${repeats} --model ${model}`,
    sdk: { name: "@anthropic-ai/sdk", version: sdkVersion() },
    node_version: process.version,
    model,
    case_set: `comparison-${cases.length}`,
    repeats,
    cases: rows,
    metrics,
    not_available: NOT_AVAILABLE,
  };

  const outDir = join(here, "results");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `compare-${RUNTIME}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(outFile, `${JSON.stringify(envelope, null, 2)}\n`);

  console.log(
    `\naccuracy ${metrics.passed}/${metrics.total} · ` +
      `schema adherence ${(metrics.schema_adherence * 100).toFixed(1)}% (${metrics.unparseable} unparseable) · ` +
      `p50 ${metrics.latency_ms.p50}ms p95 ${metrics.latency_ms.p95}ms`,
  );
  if (cost) {
    console.log(`cost/ticket $${cost.per_ticket.toFixed(5)} → $${cost.monthly_projection.toFixed(0)}/mo @ 4,100/wk`);
    console.log(`  basis: ${cost.basis}`);
  }
  console.log(`\nwritten: ${outFile}`);
  console.log(`next: run the same command in the Cursor twin, then\n  npm run eval:compare:report -- ${outFile} <cursor-envelope.json>`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
