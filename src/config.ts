/**
 * Central configuration.
 *
 * TEACHING NOTE: every model id and tuning knob lives here, in one place.
 * In the labs we change `EFFORT.triage` and `MODEL` and watch cost/latency
 * move. If those literals were scattered across route files, that exercise
 * would be a scavenger hunt instead of a one-line diff.
 */

/** Claude Opus 5 — 1M context, adaptive thinking on by default. */
export const MODEL = process.env.TRIAGE_MODEL ?? "claude-opus-5";

/**
 * `effort` controls how much thinking + total token spend Claude puts into a
 * turn. It lives inside `output_config`, NOT at the top level.
 *   low | medium | high | xhigh | max   (default: high)
 *
 * We deliberately vary it per route to make the tradeoff visible:
 *  - triage  : a bounded classification. `low` is plenty and it's the hot path.
 *  - resolve : multi-step tool reasoning. `high` earns its keep.
 *  - draft   : customer-facing prose. `medium` is the sweet spot.
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

/** Claude Opus 5 list price, USD per million tokens. See src/lib/usage.ts. */
export const PRICING = {
  inputPerMTok: 5.0,
  outputPerMTok: 25.0,
  /** Cache writes cost ~1.25x input; cache reads cost ~0.1x input. */
  cacheWriteMultiplier: 1.25,
  cacheReadMultiplier: 0.1,
} as const;

export const PORT = Number(process.env.PORT ?? 8787);
