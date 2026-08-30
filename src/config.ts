/**
 * Central configuration.
 *
 * TEACHING NOTE: every model id and tuning knob lives here, in one place.
 * In the labs we change `EFFORT.triage` and `MODEL` and watch cost/latency
 * move. If those literals were scattered across route files, that exercise
 * would be a scavenger hunt instead of a one-line diff.
 */

/**
 * The three tiers we actually compare in Lab 7. Named rather than inlined so
 * the eval matrix and the router refer to the same strings the config does.
 */
export const MODEL_TIERS = {
  flagship: "claude-opus-5",
  balanced: "claude-sonnet-5",
  fast: "claude-haiku-4-5",
} as const;

export type Tier = keyof typeof MODEL_TIERS;

/** Claude Opus 5 — 1M context, adaptive thinking on by default. */
export const MODEL = process.env.TRIAGE_MODEL ?? MODEL_TIERS.flagship;

/**
 * Dated snapshots to pin against when you need reproducibility.
 *
 * TEACHING NOTE: `claude-opus-5` is an ALIAS. It is the right default for a
 * course and for most applications — you get improvements without doing
 * anything — but an alias moves under you, and it does not send an email
 * first. The failure mode is not a broken build; it is a Tuesday where your
 * eval drops two points and nothing in your git history explains it.
 *
 * The rule that transfers: **pin when you need to attribute a change, float
 * when you want improvements.** A regression suite pins, because its whole job
 * is to answer "did MY change do this?" and a moving model makes that
 * unanswerable. Production usually floats, with a scheduled job that runs the
 * eval against the pin and shows you the delta BEFORE you move it — which is
 * what .github/workflows/ci.yml does on a weekly cron.
 *
 * Empty by default rather than pre-filled with ids that will be stale by the
 * time you read this. Fill it from `client.models.list()` when you need it.
 */
export const MODEL_PINS: Record<string, string> = {
  // triage: "claude-opus-5-20260401",
};

/** The pinned id for a role, or the floating alias when nothing is pinned. */
export function modelFor(role: string): string {
  return MODEL_PINS[role] ?? MODEL;
}

/**
 * `effort` controls how much thinking + total token spend Claude puts into a
 * turn. It lives inside `output_config`, NOT at the top level.
 *   low | medium | high | xhigh | max   (default: high)
 *
 * We deliberately vary it per route to make the tradeoff visible:
 *  - triage  : a bounded classification. `low` is plenty and it's the hot path.
 *  - resolve : multi-step tool reasoning. `high` earns its keep.
 *  - draft   : customer-facing prose. `medium` is the sweet spot.
 *
 * NOT every model accepts it — see `supportsEffort` in MODEL_CATALOG. Sending
 * `effort` to Haiku 4.5 is a 400, which is the first thing Lab 7 makes you hit.
 */
export const EFFORT = {
  triage: "low",
  resolve: "high",
  draft: "medium",
} as const;

/**
 * max_tokens is an ENFORCED ceiling the model cannot see. Hitting it truncates
 * mid-sentence (stop_reason: "max_tokens"). Non-streaming requests stay modest
 * so they finish inside the SDK's HTTP timeout; streaming requests get room.
 */
export const MAX_TOKENS = {
  nonStreaming: 16_000,
  streaming: 64_000,
} as const;

/** USD per million tokens, plus the multipliers that apply to the input rate. */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Cache writes cost ~1.25x input; cache reads cost ~0.1x input. */
  cacheWriteMultiplier: number;
  cacheReadMultiplier: number;
  /** The Batches API bills at half rate. Used by scripts/triage-queue-batch.ts. */
  batchMultiplier: number;
}

/**
 * What a model costs AND what it can do. Tiering is not a name swap: the
 * cheaper tiers differ in ways that break a request, not just a budget.
 *
 * `supportsEffort: false` means `output_config.effort` returns a 400 on that
 * model. Haiku 4.5 predates the effort parameter and uses the older
 * `thinking: {type: "enabled", budget_tokens: N}` shape instead — which is why
 * `buildTriageRequest` drops both fields rather than translating between them.
 * A classifier does not need thinking, so dropping it is the honest answer
 * here; a reasoning-heavy route would need a real translation layer.
 */
export interface ModelSpec extends ModelPricing {
  /** Rejects `output_config.effort` when false. */
  supportsEffort: boolean;
  /** Adaptive thinking (`{type: "adaptive"}`) vs. the older budget_tokens shape. */
  supportsAdaptiveThinking: boolean;
  contextWindow: number;
  /**
   * Shortest prefix this model will cache, in tokens.
   *
   * TEACHING NOTE: this is NOT a constant across the lineup, and it is not
   * monotonic across generations either. A 3.4K-token prefix caches on Opus 5
   * and silently does not on Haiku 4.5. Below the minimum the API returns
   * HTTP 200, a correct answer, and `cache_creation_input_tokens: 0` — there
   * is no error and no warning. That is why this lives in the catalog next to
   * the price: changing tier changes your caching behaviour, and Lab 7 makes
   * you find that out by measurement.
   */
  cacheMinimumTokens: number;
}

/**
 * List prices at time of writing. VERIFY against https://claude.com/pricing
 * before quoting any of these numbers to anyone — they move, and a stale table
 * produces confidently wrong cost projections, which is worse than none.
 *
 * The rule that transfers: encode the rate you will still be billed at after
 * any promotion ends. A cost model built on a promotional rate silently
 * over-promises the day it expires, and nobody re-runs the projection.
 *
 * `cacheMinimumTokens` is the shortest prefix each model will cache. It is the
 * one column here that is not about money and the one people forget to check
 * when they change tier — see the note on ModelSpec.
 */
export const MODEL_CATALOG: Record<string, ModelSpec> = {
  "claude-opus-5": {
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
    batchMultiplier: 0.5,
    supportsEffort: true,
    supportsAdaptiveThinking: true,
    contextWindow: 1_000_000,
    cacheMinimumTokens: 512,
  },
  "claude-sonnet-5": {
    inputPerMTok: 2.0,
    outputPerMTok: 10.0,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
    batchMultiplier: 0.5,
    supportsEffort: true,
    supportsAdaptiveThinking: true,
    contextWindow: 1_000_000,
    cacheMinimumTokens: 1024,
  },
  "claude-haiku-4-5": {
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
    batchMultiplier: 0.5,
    supportsEffort: false,
    supportsAdaptiveThinking: false,
    contextWindow: 200_000,
    // 4096 — eight times the Opus 5 minimum. The handbook prefix this service
    // sends is ~3.4K tokens, so it does NOT cache here. See Lab 7, Step 1.
    cacheMinimumTokens: 4096,
  },
};

/**
 * Resolve a model id to its spec.
 *
 * TEACHING NOTE: this THROWS on an unknown id rather than defaulting to
 * flagship rates. A cost table that silently guesses is worse than one that
 * crashes — you find out at the invoice instead of at the call site. If you
 * point TRIAGE_MODEL at something new, add a row; that is the whole ceremony.
 */
export function specFor(model: string): ModelSpec {
  const exact = MODEL_CATALOG[model];
  if (exact) return exact;

  // Dated snapshots (claude-haiku-4-5-20251001) price as their base model.
  const undated = model.replace(/-\d{8}$/, "");
  const dated = MODEL_CATALOG[undated];
  if (dated) return dated;

  throw new Error(
    `No pricing or capability data for model "${model}". Add a row to ` +
      `MODEL_CATALOG in src/config.ts (verify rates at https://claude.com/pricing). ` +
      `Known: ${Object.keys(MODEL_CATALOG).join(", ")}.`,
  );
}

/** Pricing half of `specFor`, for call sites that only do cost math. */
export function pricingFor(model: string): ModelPricing {
  return specFor(model);
}

/**
 * Shortest prefix `model` will cache, in tokens.
 *
 * TEACHING NOTE: call this instead of hardcoding a number. The minimum moved
 * twice in one model generation and it differs by a factor of eight across the
 * three tiers this course compares, so a literal in your code is a claim that
 * goes stale silently — which is the same failure mode as the cache bug it is
 * supposed to protect you from.
 */
export function cacheMinimumFor(model: string): number {
  return specFor(model).cacheMinimumTokens;
}

export const PORT = Number(process.env.PORT ?? 8787);
