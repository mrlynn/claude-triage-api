import "server-only";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { buildSystem, MAX_MESSAGE_CHARS } from "./triage";
import { wrapUntrusted } from "./untrusted";

/**
 * The as-you-type preview classifier.
 *
 * WHY THIS IS NOT `callClaude` WITH A DIFFERENT MODEL: the two calls answer
 * different questions. `lib/triage.ts` answers "where does this ticket go",
 * once, when a customer presses send, and it is allowed to cost a cent and
 * take two seconds. This answers "where is this ticket heading", repeatedly,
 * while the customer is still choosing their words, and it has to be cheap
 * enough to run dozens of times per message and fast enough that the answer
 * is not already stale when it lands.
 *
 * THREE THINGS MAKE THAT AFFORDABLE, and they are the reason this file is
 * worth reading rather than just running:
 *
 *   1. **A smaller model.** Haiku 4.5 is $1/$5 per MTok against Opus 5's
 *      $5/$25. The preview is a hint, not a verdict, and a hint that is
 *      occasionally wrong is a fair trade for one that arrives while you are
 *      still typing. The page shows you both, side by side, precisely so the
 *      trade is visible instead of asserted.
 *   2. **The same cached prefix.** The policy handbook is identical to the one
 *      the real classifier reads, carrying the same cache breakpoint. The
 *      cache is per-model, so the first preview of a session pays a write and
 *      every one after it reads at a tenth of the input rate. A typing session
 *      keeps the entry warm on its own.
 *   3. **A shorter schema.** Five fields, no prose. `summary`,
 *      `requested_remedy` and `escalation_reason` are all output tokens — the
 *      expensive kind — and none of them can be shown usefully to someone who
 *      has not finished their sentence.
 *
 * The one thing NOT traded away is the trust boundary. A half-written message
 * is still untrusted text from the public, so it goes through `wrapUntrusted`
 * exactly like a submitted one. A cheaper model is a weaker target for
 * injection, not a reason to drop the defence.
 */

/** Haiku, deliberately. See the header — this is a hint, not a verdict. */
export const LIVE_MODEL = process.env.LIVE_MODEL ?? "claude-haiku-4-5";

/**
 * Five fields is about 60 output tokens. The real schema's `summary` alone is
 * more than that, and nobody can read a summary of a sentence they are still
 * writing.
 */
export const MAX_LIVE_TOKENS = 300;

/** Below this there is nothing to classify and the model will guess. */
export const MIN_LIVE_CHARS = 12;

/**
 * A strict subset of `TriageSchema`, in the order the fields should appear.
 *
 * FIELD ORDER IS A UI DECISION HERE, which is unusual enough to flag. The
 * model emits JSON keys in schema order, and this endpoint streams each field
 * out the moment it completes, so the order below is the order the chips fill
 * in on screen. Category first because it is the one that frames everything
 * after it; confidence last because it is the model's verdict on its own
 * answer and reads oddly before there is an answer to judge.
 */
export const LiveSchema = z.object({
  category: z
    .enum([
      "billing",
      "shipping",
      "product_defect",
      "returns",
      "account",
      "safety",
      "other",
    ])
    .describe("The single best-fitting category from section 8 of the handbook."),
  sentiment: z
    .enum(["angry", "frustrated", "neutral", "positive"])
    .describe("The customer's emotional register, not the severity of the issue."),
  urgency: z
    .enum(["low", "normal", "high", "urgent"])
    .describe("Urgency per section 8. Safety reports are always 'urgent'."),
  requires_human: z
    .boolean()
    .describe("True if policy section 5.3 mandates supervisor escalation."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Your calibrated confidence in this reading of an unfinished message. A fragment that could go several ways should score near 0.4, not 0.9.",
    ),
});

export type LiveResult = z.infer<typeof LiveSchema>;

/** The field names, in emission order. Exported so the client can pre-render slots. */
export const LIVE_FIELDS = [
  "category",
  "sentiment",
  "urgency",
  "requires_human",
  "confidence",
] as const;
export type LiveField = (typeof LIVE_FIELDS)[number];

const anthropic = new Anthropic({ maxRetries: 1 });

/**
 * One preview pass, streamed.
 *
 * `maxRetries: 1` rather than the triage client's 2: a preview that is slow
 * has already failed at its job, and the next keystroke will start a fresh
 * one anyway. Retrying hard on a request the user is about to supersede
 * spends money on an answer nobody will read.
 */
export function streamLive(message: string, signal?: AbortSignal) {
  return anthropic.messages.stream(
    {
      model: LIVE_MODEL,
      max_tokens: MAX_LIVE_TOKENS,
      // Same handbook, same breakpoint, same order as the real classifier.
      // The context block is deliberately empty: a draft has no product or
      // order attached yet, and inventing one would change the cached prefix.
      system: buildSystem({}),
      output_config: { format: zodOutputFormat(LiveSchema) },
      messages: [
        {
          role: "user",
          content: `A customer is part-way through writing this web form message. Classify what it is SO FAR. Do not speculate about what they have not written yet, and let your confidence reflect how much of the message you are actually reading.\n\n${wrapUntrusted(
            message,
          )}`,
        },
      ],
    },
    { signal },
  );
}

/**
 * Pulls completed fields out of a partially-received JSON string.
 *
 * WHY NOT A STREAMING JSON PARSER: we do not need one. Every field in
 * `LiveSchema` is a scalar, and a scalar is complete the moment its terminator
 * arrives — the closing quote of a string, the boundary after a number. That
 * is one regex per type and no parser state to get wrong on a truncated
 * buffer.
 *
 * The lookahead on the number matters and is easy to miss: without it, a
 * buffer ending `"confidence": 0.8` reports 0.8 and the next chunk turns it
 * into 0.85. Requiring the delimiter proves the number finished.
 */
export function completedFields(buffer: string): Partial<LiveResult> {
  const out: Partial<LiveResult> = {};

  const str = (key: string) =>
    new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(buffer)?.[1];

  const category = str("category");
  if (category) out.category = category as LiveResult["category"];
  const sentiment = str("sentiment");
  if (sentiment) out.sentiment = sentiment as LiveResult["sentiment"];
  const urgency = str("urgency");
  if (urgency) out.urgency = urgency as LiveResult["urgency"];

  const human = /"requires_human"\s*:\s*(true|false)/.exec(buffer)?.[1];
  if (human) out.requires_human = human === "true";

  const conf = /"confidence"\s*:\s*(-?\d+(?:\.\d+)?)\s*[,}]/.exec(buffer)?.[1];
  if (conf) out.confidence = Number(conf);

  return out;
}

export { MAX_MESSAGE_CHARS };
