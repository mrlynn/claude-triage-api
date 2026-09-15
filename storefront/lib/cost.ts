import { pricingFor } from "./pricing.generated";
import {
  ASSISTANT_LIMITS,
  ASSISTANT_MAX_ITERATIONS,
  ASSISTANT_MAX_TOKENS,
  LIVE_MODEL,
  MAX_LIVE_TOKENS,
  MAX_MESSAGE_CHARS,
  MAX_TOKENS,
  MODEL,
  TUTOR_MAX_TOKENS,
  TUTOR_MODEL,
} from "./callLimits";
import { TUTOR_FIELDS, TUTOR_LIMITS } from "./tutorPolicy";

/**
 * What a Claude call costs, and what it could cost at most.
 *
 * There were four copies of the cost arithmetic in this app — the pipeline,
 * the live route, the Tutor and the assistant — each a few lines of the same
 * four-term sum, and the injection route had none. This is the storefront's
 * counterpart to `src/lib/usage.ts`, and `cost.test.ts` holds the two to the
 * same answer.
 *
 * Money is integer micro-dollars. Floats drift under a `$inc`, and the ledger
 * this feeds (docs/byok/SPEC.md) is nothing but `$inc`.
 *
 * No `server-only` import, deliberately: the estimates are tested with
 * `node:test`, and a test cannot load a file that refuses to run outside Next.
 */

export type Micros = number;

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * The four input fields mean different things and are billed differently.
 * `model` should be `response.model`, not a config constant (Decision 9): the
 * figure stays right when an alias resolves to something else. An unknown
 * model throws, via `pricingFor`, rather than guessing flagship rates.
 */
export function costMicros(usage: UsageLike, model: string): Micros {
  const p = pricingFor(model);
  const cost =
    usage.input_tokens * p.inputPerMTok +
    (usage.cache_creation_input_tokens ?? 0) * p.inputPerMTok * p.cacheWriteMultiplier +
    (usage.cache_read_input_tokens ?? 0) * p.inputPerMTok * p.cacheReadMultiplier +
    usage.output_tokens * p.outputPerMTok;
  // Rates are per million tokens, so the sum is already in micro-dollars.
  return Math.round(cost);
}

/** The same call with no cache at all: every input token at the full rate. */
export function uncachedCostMicros(usage: UsageLike, model: string): Micros {
  return costMicros(
    {
      input_tokens:
        usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
      output_tokens: usage.output_tokens,
    },
    model,
  );
}

export const microsToUsd = (micros: Micros): number => micros / 1_000_000;

// ---- worst case ---------------------------------------------------------------

/**
 * Token ceilings for text WE wrote, which cannot grow without a commit. Each is
 * checked against the real files in `cost.test.ts`, at two characters per token
 * — pessimistic for English prose, about right for code-heavy course material,
 * whose measured ~33k tokens came from ~88k characters.
 */
export const OWN_TEXT_TOKENS = {
  /** The triage role plus `data/policies.md`. Shared by classify and live. */
  triageSystem: 6_000,
  /** The Tutor role plus every course document: the cached prefix. */
  tutorCorpus: 48_000,
  /** The Tutor role plus titles and objectives: what the plan call reads instead. */
  tutorIndex: 3_000,
  /** The authored mistakes a call may quote, for up to `TUTOR_FIELDS.labIds` labs, plus the instructions around them. */
  tutorMistakes: 7_000,
  /** Ask Northwind's system prompt, four tool definitions, and the policy and journey tool results. */
  assistantFixed: 4_000,
  /** The instructions around each user turn, plus the output schema, which is billed as input. */
  perCallOverhead: 2_000,
} as const;

/**
 * Text a visitor can send is counted at ONE token per character, because it
 * is adversarial: a message of emoji or rare scripts tokenises far worse than
 * prose, and the estimate has to survive the input designed to break it.
 */
const assistantContextChars =
  ASSISTANT_LIMITS.pathChars +
  ASSISTANT_LIMITS.titleChars +
  ASSISTANT_LIMITS.productChars +
  ASSISTANT_LIMITS.orderIdChars +
  ASSISTANT_LIMITS.progressItems * ASSISTANT_LIMITS.progressItemChars;

const exerciseChars =
  TUTOR_FIELDS.title + TUTOR_FIELDS.prompt + TUTOR_FIELDS.deliverable + TUTOR_FIELDS.rubric * TUTOR_FIELDS.rubricItem;

export interface Ceiling {
  model: string;
  /** Input tokens on each request of the call, in order. One entry per model request. */
  inputTokensPerRequest: readonly number[];
  maxOutputTokens: number;
}

const once = (model: string, input: number, output: number): Ceiling => ({
  model,
  inputTokensPerRequest: [input],
  maxOutputTokens: output,
});

/**
 * An agent loop resends its whole history on every request. Request `i` carries
 * everything before it: the fixed prompt, the message, the page context once
 * plus once more for every earlier turn that might have fetched it with
 * `get_current_context`, and every earlier turn's output.
 */
function assistantCeiling(): Ceiling {
  const requests = Array.from({ length: ASSISTANT_MAX_ITERATIONS }, (_, i) =>
    OWN_TEXT_TOKENS.assistantFixed +
    ASSISTANT_LIMITS.messageChars +
    assistantContextChars * (1 + i) +
    ASSISTANT_MAX_TOKENS * i,
  );
  return { model: MODEL, inputTokensPerRequest: requests, maxOutputTokens: ASSISTANT_MAX_TOKENS };
}

/** Keyed by what the call is, not which route runs it: the support form and the injection playground are both `classify`. */
export const SURFACE_CEILINGS = {
  classify: once(
    MODEL,
    OWN_TEXT_TOKENS.triageSystem + MAX_MESSAGE_CHARS + OWN_TEXT_TOKENS.perCallOverhead,
    MAX_TOKENS,
  ),
  live: once(
    LIVE_MODEL,
    OWN_TEXT_TOKENS.triageSystem + MAX_MESSAGE_CHARS + OWN_TEXT_TOKENS.perCallOverhead,
    MAX_LIVE_TOKENS,
  ),
  tutor_plan: once(
    TUTOR_MODEL,
    OWN_TEXT_TOKENS.tutorIndex + OWN_TEXT_TOKENS.perCallOverhead,
    TUTOR_MAX_TOKENS.plan,
  ),
  tutor_lesson: once(
    TUTOR_MODEL,
    OWN_TEXT_TOKENS.tutorCorpus +
      OWN_TEXT_TOKENS.tutorMistakes +
      TUTOR_FIELDS.title +
      TUTOR_FIELDS.objectives * TUTOR_FIELDS.objective +
      OWN_TEXT_TOKENS.perCallOverhead,
    TUTOR_MAX_TOKENS.lesson,
  ),
  tutor_review: once(
    TUTOR_MODEL,
    OWN_TEXT_TOKENS.tutorCorpus + OWN_TEXT_TOKENS.tutorMistakes + exerciseChars + TUTOR_LIMITS.maxAttemptChars +
      OWN_TEXT_TOKENS.perCallOverhead,
    TUTOR_MAX_TOKENS.review,
  ),
  tutor_hint: once(
    TUTOR_MODEL,
    OWN_TEXT_TOKENS.tutorCorpus +
      OWN_TEXT_TOKENS.tutorMistakes +
      exerciseChars +
      TUTOR_LIMITS.maxAttemptChars +
      TUTOR_LIMITS.maxQuestionChars +
      TUTOR_LIMITS.maxHints * TUTOR_FIELDS.hint +
      OWN_TEXT_TOKENS.perCallOverhead,
    TUTOR_MAX_TOKENS.hint,
  ),
  assistant_turn: assistantCeiling(),
} satisfies Record<string, Ceiling>;

export type Surface = keyof typeof SURFACE_CEILINGS;

/**
 * The most a ceiling can cost. Every input token is priced as a cache WRITE —
 * the dearest way to bill input — so a cold cache cannot push the real figure
 * over the estimate, and every request is assumed to emit `max_tokens`.
 */
export function ceilingMicros(ceiling: Ceiling): Micros {
  const p = pricingFor(ceiling.model);
  const inputRate = p.inputPerMTok * Math.max(1, p.cacheWriteMultiplier);
  const perRequest = ceiling.inputTokensPerRequest.map(
    (input) => input * inputRate + ceiling.maxOutputTokens * p.outputPerMTok,
  );
  return Math.ceil(perRequest.reduce((a, b) => a + b, 0));
}

/** What to reserve before a call on this surface, in micro-dollars. */
export function estimateMicros(surface: Surface): Micros {
  return ceilingMicros(SURFACE_CEILINGS[surface]);
}
