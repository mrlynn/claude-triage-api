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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { app } from "../src/server.js";
import { anthropic, assertCredentials } from "../src/anthropic.js";
import { MODEL, MAX_TOKENS } from "../src/config.js";
import { summarizeUsage } from "../src/lib/usage.js";
import type { TriageResult } from "../src/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));

interface EvalCase {
  id: string;
  message: string;
  expected: {
    category: string;
    urgency: string;
    requires_human: boolean;
    requested_remedy: string;
  };
  notes: string;
}

const cases: EvalCase[] = readFileSync(join(here, "dataset.jsonl"), "utf8")
  .split("\n")
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line));

// ---------------------------------------------------------------------------
// Part 1 — deterministic triage scoring
// ---------------------------------------------------------------------------

interface CaseResult {
  id: string;
  passed: boolean;
  failures: string[];
  confidence: number;
  cost_usd: number;
  latency_ms: number;
}

async function scoreTriage(): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  for (const testCase of cases) {
    const started = Date.now();
    const res = await app.request("/v1/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: testCase.message }),
    });

    if (!res.ok) {
      results.push({
        id: testCase.id,
        passed: false,
        failures: [`HTTP ${res.status}: ${await res.text()}`],
        confidence: 0,
        cost_usd: 0,
        latency_ms: Date.now() - started,
      });
      continue;
    }

    const body = (await res.json()) as {
      triage: TriageResult;
      meta: { usage: { estimated_cost_usd: number } };
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
      passed: failures.length === 0,
      failures,
      confidence: got.confidence,
      cost_usd: body.meta.usage.estimated_cost_usd,
      latency_ms: Date.now() - started,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Part 2 — LLM-as-judge on drafted replies
// ---------------------------------------------------------------------------

const JudgeSchema = z.object({
  evidence: z
    .array(z.string())
    .describe(
      "Direct quotes from the reply that bear on the rubric, gathered BEFORE scoring. Quote violations and compliant moves alike.",
    ),
  leads_with_resolution: z.boolean().describe("Rubric 1: the first sentence states what will happen, not an apology."),
  apology_count_ok: z.boolean().describe("Rubric 2: at most one apology in the entire reply."),
  no_banned_phrases: z
    .boolean()
    .describe("Rubric 3: contains none of 'unfortunately', 'as per our policy', \"I'm afraid\"."),
  no_internal_jargon: z.boolean().describe("Rubric 4: no 'RMA', 'SKU', 'P1', 'tier-2', ticket IDs, or queue names."),
  no_unauthorized_promise: z
    .boolean()
    .describe("Rubric 5: makes no promise the handbook forbids (immediate refunds, future features, unannounced fix dates)."),
  under_180_words: z.boolean().describe("Rubric 6: the reply is under 180 words."),
  verdict: z.enum(["pass", "fail"]).describe("Fail if ANY rubric item is false."),
  rationale: z.string().describe("Two sentences explaining the verdict, referencing the evidence."),
});

const JUDGE_SYSTEM = `You are a support-quality auditor. You grade a customer-facing reply against a fixed rubric.

You are grading the TEXT ONLY. You do not know, and must not speculate about, how it was produced.

Method, in this order:
1. Collect evidence: quote the exact spans of the reply relevant to each rubric item.
2. Only then decide each rubric item.
3. The verdict is "fail" if any single rubric item is false. There is no partial credit and no rounding up for effort.

Be strict. A reply that is pleasant but breaks a rule fails. Graders who pass borderline work make the metric useless.`;

interface JudgeResult {
  id: string;
  verdict: "pass" | "fail";
  rationale: string;
  broken_rules: string[];
  cost_usd: number;
}

async function judgeDrafts(sample: EvalCase[]): Promise<JudgeResult[]> {
  const results: JudgeResult[] = [];

  for (const testCase of sample) {
    // Generate a reply through the real streaming route, collecting the text.
    const res = await app.request("/v1/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: testCase.message }),
    });

    const reply = await collectSseText(res);
    if (!reply.trim()) {
      results.push({
        id: testCase.id,
        verdict: "fail",
        rationale: "The draft route produced no text.",
        broken_rules: ["no_output"],
        cost_usd: 0,
      });
      continue;
    }

    const judged = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS.nonStreaming,
      system: JUDGE_SYSTEM,
      output_config: { effort: "medium", format: zodOutputFormat(JudgeSchema) },
      messages: [
        {
          role: "user",
          content: `Grade this reply.\n\n<reply>\n${reply}\n</reply>`,
        },
      ],
    });

    const verdict = judged.parsed_output;
    if (!verdict) {
      results.push({
        id: testCase.id,
        verdict: "fail",
        rationale: "Judge output failed schema validation.",
        broken_rules: ["judge_unparseable"],
        cost_usd: summarizeUsage(judged.usage).estimated_cost_usd,
      });
      continue;
    }

    const broken = Object.entries({
      leads_with_resolution: verdict.leads_with_resolution,
      apology_count_ok: verdict.apology_count_ok,
      no_banned_phrases: verdict.no_banned_phrases,
      no_internal_jargon: verdict.no_internal_jargon,
      no_unauthorized_promise: verdict.no_unauthorized_promise,
      under_180_words: verdict.under_180_words,
    })
      .filter(([, ok]) => !ok)
      .map(([rule]) => rule);

    results.push({
      id: testCase.id,
      verdict: verdict.verdict,
      rationale: verdict.rationale,
      broken_rules: broken,
      cost_usd: summarizeUsage(judged.usage).estimated_cost_usd,
    });
  }

  return results;
}

/** Drains an SSE response and concatenates the `text` events. */
async function collectSseText(res: Response): Promise<string> {
  if (!res.body) return "";
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";

  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
      if (eventLine?.slice(7) === "text" && dataLine) {
        out += (JSON.parse(dataLine.slice(6)) as { text: string }).text;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

async function main() {
  assertCredentials();

  console.log(`\nTriage accuracy — ${cases.length} cases, model ${MODEL}\n`);
  const triageResults = await scoreTriage();

  for (const r of triageResults) {
    const mark = r.passed ? "PASS" : "FAIL";
    console.log(
      `  ${mark}  ${r.id}  conf=${r.confidence.toFixed(2)}  ${r.latency_ms}ms  $${r.cost_usd.toFixed(4)}`,
    );
    for (const f of r.failures) console.log(`          - ${f}`);
  }

  const passed = triageResults.filter((r) => r.passed).length;
  const accuracy = passed / triageResults.length;
  const triageCost = triageResults.reduce((a, r) => a + r.cost_usd, 0);

  // Calibration: is the confidence score actually informative? If failures
  // score as confidently as passes, the field is decoration.
  const avgConf = (rs: CaseResult[]) =>
    rs.length === 0 ? 0 : rs.reduce((a, r) => a + r.confidence, 0) / rs.length;

  console.log(`\n  accuracy: ${passed}/${triageResults.length} (${(accuracy * 100).toFixed(1)}%)`);
  console.log(`  mean confidence on passes: ${avgConf(triageResults.filter((r) => r.passed)).toFixed(2)}`);
  console.log(`  mean confidence on fails:  ${avgConf(triageResults.filter((r) => !r.passed)).toFixed(2)}`);
  console.log(`  triage cost: $${triageCost.toFixed(4)}\n`);

  // Judge a subset — judging every case doubles cost for little extra signal.
  const sample = cases.slice(0, 4);
  console.log(`Tone compliance (LLM judge) — ${sample.length} drafted replies\n`);
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
