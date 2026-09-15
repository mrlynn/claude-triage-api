import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { summarizeUsage } from "../../src/lib/usage";
import { PRICING_BY_MODEL } from "./pricing.generated";
import { TUTOR_FIELDS } from "./tutorPolicy";
import {
  OWN_TEXT_TOKENS,
  SURFACE_CEILINGS,
  ceilingMicros,
  costMicros,
  estimateMicros,
  uncachedCostMicros,
  type Surface,
} from "./cost";

const here = import.meta.dirname;
const read = (...parts: string[]) => readFileSync(join(here, ...parts), "utf8");

/** Our own text is measured at two characters per token. See OWN_TEXT_TOKENS. */
const tokensOf = (chars: number) => Math.ceil(chars / 2);

/** Every string and template literal in a source file: the prompt text, without the comments explaining it. */
const literalChars = (source: string) =>
  (source.match(/"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? []).reduce((n, s) => n + s.length, 0);

const usage = {
  input_tokens: 1_234,
  cache_creation_input_tokens: 33_000,
  cache_read_input_tokens: 66_000,
  output_tokens: 2_222,
};

test("costMicros agrees with src/lib/usage.ts for every catalogued model", () => {
  for (const model of Object.keys(PRICING_BY_MODEL)) {
    const report = summarizeUsage(usage, model);
    assert.equal(costMicros(usage, model) / 1e6, report.estimated_cost_usd, `${model} cached`);
    assert.equal(uncachedCostMicros(usage, model) / 1e6, report.uncached_cost_usd, `${model} uncached`);
  }
});

test("costMicros prices a dated model id like its alias, and throws on an unknown one", () => {
  assert.equal(costMicros(usage, "claude-opus-5-20260101"), costMicros(usage, "claude-opus-5"));
  assert.throws(() => costMicros(usage, "claude-imaginary-9"), /No pricing/);
});

test("every surface estimate is a positive whole number of micro-dollars", () => {
  for (const surface of Object.keys(SURFACE_CEILINGS) as Surface[]) {
    const micros = estimateMicros(surface);
    assert.ok(Number.isInteger(micros) && micros > 0, `${surface}: ${micros}`);
  }
});

test("an estimate covers the dearest real usage its ceiling allows", () => {
  // The worst bill a ceiling permits: every input token written to cache, every request at max_tokens.
  for (const [surface, ceiling] of Object.entries(SURFACE_CEILINGS)) {
    const worst = ceiling.inputTokensPerRequest.reduce(
      (sum, input) =>
        sum +
        costMicros(
          { input_tokens: 0, cache_creation_input_tokens: input, output_tokens: ceiling.maxOutputTokens },
          ceiling.model,
        ),
      0,
    );
    assert.ok(estimateMicros(surface as Surface) >= worst, surface);
  }
});

test("an estimate grows with max_tokens, so raising a ceiling cannot leave the reservation behind", () => {
  const base = SURFACE_CEILINGS.classify;
  assert.ok(ceilingMicros({ ...base, maxOutputTokens: base.maxOutputTokens + 1_000 }) > ceilingMicros(base));
});

test("the agent loop is priced per request, with history growing", () => {
  const { inputTokensPerRequest } = SURFACE_CEILINGS.assistant_turn;
  assert.ok(inputTokensPerRequest.length > 1);
  for (let i = 1; i < inputTokensPerRequest.length; i++) {
    assert.ok(inputTokensPerRequest[i]! > inputTokensPerRequest[i - 1]!);
  }
});

// ---- the own-text ceilings still fit the text -----------------------------------

test("the triage system prompt fits its ceiling", () => {
  const role = /const ROLE = `([^`]*)`/.exec(read("triage.ts"))?.[1] ?? "";
  assert.ok(role.length > 500, "found the triage ROLE literal");
  const chars = role.length + read("..", "data", "policies.md").length;
  assert.ok(tokensOf(chars) <= OWN_TEXT_TOKENS.triageSystem, `${tokensOf(chars)} > ${OWN_TEXT_TOKENS.triageSystem}`);
});

interface CorpusDoc {
  id: string;
  title: string;
  objectives: string[];
  body: string;
  mistakes: { id: string; wrong: string; symptom: string }[];
}
const corpus = JSON.parse(read("..", "data", "tutor-corpus.json")) as CorpusDoc[];
const tutorRole = /const ROLE = `([^`]*)`/.exec(read("tutor.ts"))?.[1] ?? "";

test("the Tutor corpus prefix fits its ceiling", () => {
  assert.ok(tutorRole.length > 500, "found the tutor ROLE literal");
  // Mirrors DOCS in tutor.ts: a wrapper per document around objectives and body.
  const docs = corpus.reduce(
    (n, d) => n + 60 + d.id.length + d.title.length + d.objectives.reduce((m, o) => m + o.length + 3, 0) + d.body.length,
    0,
  );
  const tokens = tokensOf(tutorRole.length + docs);
  assert.ok(tokens <= OWN_TEXT_TOKENS.tutorCorpus, `${tokens} > ${OWN_TEXT_TOKENS.tutorCorpus}`);
});

test("the Tutor plan index fits its ceiling", () => {
  const index = corpus.reduce(
    (n, d) => n + 10 + d.id.length + d.title.length + d.objectives.reduce((m, o) => m + o.length + 8, 0),
    0,
  );
  const tokens = tokensOf(tutorRole.length + index);
  assert.ok(tokens <= OWN_TEXT_TOKENS.tutorIndex, `${tokens} > ${OWN_TEXT_TOKENS.tutorIndex}`);
});

test("the authored mistakes for the most mistake-heavy labs fit their ceiling", () => {
  const perLab = corpus
    .map((d) => d.mistakes.reduce((n, m) => n + 30 + m.id.length + m.wrong.length + m.symptom.length, 0))
    .sort((a, b) => b - a)
    .slice(0, TUTOR_FIELDS.labIds);
  // Plus the fixed starter instructions around them.
  const tokens = tokensOf(perLab.reduce((a, b) => a + b, 0) + 2_000);
  assert.ok(tokens <= OWN_TEXT_TOKENS.tutorMistakes, `${tokens} > ${OWN_TEXT_TOKENS.tutorMistakes}`);
});

test("Ask Northwind's fixed prompt and tool text fit their ceiling", () => {
  const chars =
    literalChars(read("assistantAgent.ts")) + literalChars(read("assistantJourney.ts")) + literalChars(read("assistantPolicy.ts"));
  const tokens = tokensOf(chars);
  assert.ok(tokens <= OWN_TEXT_TOKENS.assistantFixed, `${tokens} > ${OWN_TEXT_TOKENS.assistantFixed}`);
});
