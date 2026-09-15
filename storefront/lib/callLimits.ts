/**
 * Every number that bounds what one Claude call can cost, in one file.
 *
 * These lived beside the calls they bound, and the call files still re-export
 * them. They moved here for one reason: `cost.ts` turns them into a worst-case
 * price before a call runs, and that has to be importable from a plain
 * `node:test` file. The call files are `server-only` and read the handbook off
 * disk at import, so a test cannot load them.
 *
 * Raise a `max_tokens` here and the reservation in `estimateMicros` follows,
 * because it reads the same constant rather than a copy.
 */

// ---- triage: the support form, its SSE twin, and the injection playground ---

export const MODEL = process.env.TRIAGE_MODEL ?? "claude-opus-5";

/** Hard ceiling. A classification is ~150 tokens; this caps a runaway. */
export const MAX_TOKENS = 900;

/** Longer than any genuine support message, short enough to bound cost. */
export const MAX_MESSAGE_CHARS = 2000;

// ---- the as-you-type preview ------------------------------------------------

/** The cheaper tier, deliberately. See the header of `live.ts` — this is a hint, not a verdict. */
export const LIVE_MODEL = process.env.LIVE_MODEL ?? "claude-sonnet-5";

/**
 * Five fields is about 60 output tokens. The real schema's `summary` alone is
 * more than that, and nobody can read a summary of a sentence they are still
 * writing.
 */
export const MAX_LIVE_TOKENS = 300;

// ---- the Tutor ----------------------------------------------------------------

export const TUTOR_MODEL = process.env.TUTOR_MODEL ?? "claude-sonnet-5";

/** Per call. The lesson is the largest: a brief, a six-question drill, an exercise and a starter. */
export const TUTOR_MAX_TOKENS = {
  plan: 6_000,
  lesson: 8_000,
  review: 4_000,
  hint: 1_500,
} as const;

// ---- Ask Northwind --------------------------------------------------------------

/** Hard ceiling on turns. An uncapped agent loop is an uncapped bill. */
export const ASSISTANT_MAX_ITERATIONS = 6;

/** A chat answer is a few hundred tokens; this bounds a runaway. */
export const ASSISTANT_MAX_TOKENS = 1200;

/** What the message route accepts. The page context is echoed back by a tool, so it is input too. */
export const ASSISTANT_LIMITS = {
  messageChars: 2_000,
  pathChars: 300,
  titleChars: 200,
  productChars: 120,
  orderIdChars: 40,
  progressItems: 20,
  progressItemChars: 80,
} as const;
