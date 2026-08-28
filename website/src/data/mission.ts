export const MISSION_VERSION = 1;

export type ModelTier = "opus" | "sonnet" | "haiku";
export type CacheMode = "stable" | "volatile";
export type SchemaMode = "constrained" | "prompt_only";
export type GuardrailMode = "enforced" | "model_claim";

export type SimulatorChoices = {
  model: ModelTier;
  cache: CacheMode;
  schema: SchemaMode;
  guardrails: GuardrailMode;
  volume: number;
};

export const DEFAULT_CHOICES: SimulatorChoices = {
  model: "sonnet",
  cache: "stable",
  schema: "constrained",
  guardrails: "enforced",
  volume: 16_400,
};

export const MILESTONES = [
  { id: "triage", title: "Stabilize triage", detail: "Choose the operating tier for 4,100 tickets a week.", link: "/playground/models" },
  { id: "contract", title: "Enforce the contract", detail: "Make the classifier safe for software to consume.", link: "/docs/labs/lab-2-structured-outputs" },
  { id: "investigate", title: "Investigate with evidence", detail: "Let tools retrieve facts, then enforce authority in code.", link: "/playground/trace" },
  { id: "serve", title: "Serve the customer", detail: "Keep the policy prefix warm as volume grows.", link: "/playground/cache" },
  { id: "prove", title: "Prove it is safe to ship", detail: "Turn choices into an evaluation and launch plan.", link: "/docs/labs/lab-6-evals" },
] as const;

const MODELS: Record<ModelTier, { label: string; cost: number; p50: string; p95: string; quality: string; evidence: string }> = {
  opus: { label: "Opus 5", cost: 0.025, p50: "5.1s", p95: "8.6s", quality: "Highest-quality baseline", evidence: "/playground/models" },
  sonnet: { label: "Sonnet 5", cost: 0.014, p50: "2.7s", p95: "4.8s", quality: "Balanced tier; validate against your cases", evidence: "/playground/models" },
  haiku: { label: "Haiku 4.5", cost: 0.005, p50: "1.3s", p95: "2.4s", quality: "Fast tier; adaptive effort is unavailable", evidence: "/playground/models" },
};

export type Outcome = {
  monthlyCost: string;
  p50: string;
  p95: string;
  cache: string;
  quality: string;
  safety: "Ready" | "At risk";
  consequence: string;
  risks: { title: string; symptom: string; signal: string; fix: string; link: string }[];
};

/** Pure, deliberately conservative model. Values are either measured baselines or arithmetic projections. */
export function evaluate(choices: SimulatorChoices): Outcome {
  const model = MODELS[choices.model];
  const cacheMultiplier = choices.cache === "stable" ? 1 : 2.55;
  const monthly = model.cost * cacheMultiplier * choices.volume;
  const risks: Outcome["risks"] = [];
  if (choices.cache === "volatile") risks.push({ title: "Cache prefix moved", symptom: "The request still succeeds, but costs rise silently.", signal: "cache_read_input_tokens is zero across requests.", fix: "Move dates and customer context after cache_control.", link: "/playground/cache" });
  if (choices.schema === "prompt_only") risks.push({ title: "Output is only a suggestion", symptom: "A valid-looking response breaks a downstream consumer.", signal: "JSON parse/repair errors or missing fields.", fix: "Attach a Zod output format and guard parsed_output.", link: "/docs/labs/lab-2-structured-outputs" });
  if (choices.guardrails === "model_claim") risks.push({ title: "Authority is self-reported", symptom: "A persuasive ticket produces an over-limit refund recommendation.", signal: "The model claims authority without trace-derived support.", fix: "Recompute limits from the tool trace on the server.", link: "/playground/injection" });
  if (choices.model === "haiku") risks.push({ title: "Capability mismatch", symptom: "Applying output_config.effort returns a 400.", signal: "An unsupported-parameter error from the model API.", fix: "Consult the model catalog and omit unsupported effort controls.", link: "/docs/labs/lab-7-choosing-a-model" });
  return {
    monthlyCost: `$${Math.round(monthly).toLocaleString()}`,
    p50: model.p50,
    p95: model.p95,
    cache: choices.cache === "stable" ? "Warm after the first request" : "Cold on every request",
    quality: choices.schema === "constrained" ? model.quality : "Unbounded shape; quality cannot be safely consumed",
    safety: risks.some((risk) => risk.title === "Output is only a suggestion" || risk.title === "Authority is self-reported") ? "At risk" : "Ready",
    consequence: risks.length === 0 ? "Northwind can automate routing with an auditable path to human review." : `This design carries ${risks.length} named production risk${risks.length === 1 ? "" : "s"}. Fix those before automating decisions.`,
    risks,
  };
}

export const PATTERNS = [
  { title: "Constrain the output", use: "A model response feeds software, not just a person.", code: "messages.parse({ output_config: { format: zodOutputFormat(Schema) } })", failure: "Prompt-only JSON drifts until a downstream consumer breaks.", test: "Send a boundary-case ticket and assert parsed_output matches the schema.", link: "/docs/labs/lab-2-structured-outputs" },
  { title: "Cache the stable prefix", use: "A large policy or instruction block repeats across requests.", code: "[{ text: stable, cache_control: { type: 'ephemeral' } }, { text: volatile }]", failure: "A timestamp before the breakpoint makes every request cold.", test: "Make two equivalent calls and assert cache_read_input_tokens > 0 on the second.", link: "/docs/labs/lab-5-prompt-caching" },
  { title: "Re-derive authority", use: "A tool-using agent can recommend a financially or legally bounded action.", code: "const corrected = enforceAuthority(resolution, toolTrace)", failure: "The model repeats a forged approval as though it were a fact.", test: "Attempt an over-limit refund and assert the returned resolution is corrected.", link: "/docs/labs/lab-3-tool-use" },
] as const;
