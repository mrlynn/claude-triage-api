import "server-only";
import { z } from "zod";
import { checkLimits } from "./ratelimit";
import { pricingFor } from "./pricing.generated";
import { redactPII } from "./untrusted";
import { insertEscalation } from "./models";
import { HAS_MONGO } from "./mongo";
import { recordCall, recordBlocked } from "./telemetry";
import {
  MAX_MESSAGE_CHARS,
  MAX_TOKENS,
  MODEL,
  TriageSchema,
  buildSystem,
  callClaude,
  schemaFieldSummary,
  type TriageResult,
} from "./triage";

/**
 * The request pipeline, as an async generator of stage events.
 *
 * WHY A GENERATOR: the storefront needs to narrate this to a learner while it
 * runs, and the plain JSON endpoint needs the same logic without narration.
 * One generator, two consumers, no duplicated control flow. If a stage moves,
 * it moves in both places.
 *
 * Every number reported here is measured at the moment it is emitted. Nothing
 * is simulated and nothing is padded — the fact that the model call dominates
 * total wall time by two orders of magnitude is the point, not a flaw to
 * smooth over.
 */

export const StageId = [
  "validate",
  "ratelimit",
  "prompt",
  "schema",
  "model",
  "parse",
  "account",
  "persist",
] as const;
export type StageId = (typeof StageId)[number];

export interface StageEvent {
  type: "stage";
  id: StageId;
  status: "running" | "done" | "failed";
  ms?: number;
  /** Short, plain statement of what this stage just did. */
  headline?: string;
  /** Optional structured payload the UI renders in a detail panel. */
  detail?: Record<string, unknown>;
}

export interface ResultEvent {
  type: "result";
  triage: TriageResult;
  cost_usd: number;
  cache_hit: boolean;
  latency_ms: number;
  total_ms: number;
  /** Present when the ticket was escalated and stored. Shown to the customer. */
  ticket_id?: string;
}

export interface FailureEvent {
  type: "failure";
  id: StageId;
  status: number;
  error: string;
  detail: string;
  /**
   * Seconds until a retry could succeed, when we know. The limiter has always
   * computed this; until now nothing carried it out of the pipeline, so a 429
   * told the client to back off without saying for how long.
   */
  retryAfterSec?: number;
}

export type PipelineEvent = StageEvent | ResultEvent | FailureEvent;

const Input = z.object({
  message: z.string().min(10).max(MAX_MESSAGE_CHARS),
  product: z.string().max(120).optional(),
  orderId: z.string().max(40).optional(),
});

export async function* runPipeline(
  raw: unknown,
  ip: string,
): AsyncGenerator<PipelineEvent> {
  const t0 = Date.now();
  const mark = () => Date.now();

  // ---- 1. Validate ------------------------------------------------------
  let s = mark();
  yield { type: "stage", id: "validate", status: "running" };

  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    yield { type: "stage", id: "validate", status: "failed", ms: mark() - s };
    yield {
      type: "failure",
      id: "validate",
      status: 400,
      error: "invalid_request",
      detail: `Tell us what happened in 10 to ${MAX_MESSAGE_CHARS} characters.`,
    };
    return;
  }
  const { message, product, orderId } = parsed.data;

  yield {
    type: "stage",
    id: "validate",
    status: "done",
    ms: mark() - s,
    headline: `${message.length} characters accepted`,
    detail: {
      why: "Bounding input length bounds the cost of the call that follows. This runs before anything that spends money.",
      limits: `10 to ${MAX_MESSAGE_CHARS} characters`,
    },
  };

  // ---- 2. Rate limit ----------------------------------------------------
  s = mark();
  yield { type: "stage", id: "ratelimit", status: "running" };

  const verdict = await checkLimits(ip);
  if (!verdict.ok) {
    // Counted separately: a blocked request has no category and no cost, and
    // folding it into `calls` would quietly deflate the mean cost per call.
    recordBlocked();
    yield { type: "stage", id: "ratelimit", status: "failed", ms: mark() - s };
    yield {
      type: "failure",
      id: "ratelimit",
      status: 429,
      error: verdict.reason,
      retryAfterSec: verdict.retryAfterSec,
      detail:
        verdict.reason === "per_ip"
          ? "You have submitted a few of these already. Give it a few minutes."
          : verdict.reason === "daily_cap"
            ? "This demo has hit its daily cap. It resets at midnight UTC."
            : verdict.reason === "store_error"
              ? "We cannot verify the demo's spend limit right now, so live submissions are paused."
              : "The demo is not configured to accept live submissions right now.",
    };
    return;
  }

  yield {
    type: "stage",
    id: "ratelimit",
    status: "done",
    ms: mark() - s,
    headline: `Allowed. ${verdict.remaining} of today's budget left`,
    detail: {
      why: "A public form that calls a frontier model is an uncapped bill. Two atomic increments in MongoDB, one per IP window and one global for the day, both on documents that expire themselves.",
      store: "MongoDB Atlas, TTL-indexed",
      fails: "closed — if the ceiling cannot be checked, nothing is spent",
    },
  };

  // ---- 3. Assemble the prompt ------------------------------------------
  s = mark();
  yield { type: "stage", id: "prompt", status: "running" };

  const system = buildSystem({ product, orderId });
  const frozenChars = system[0].text.length;
  const volatileChars = system[1].text.length;

  yield {
    type: "stage",
    id: "prompt",
    status: "done",
    ms: mark() - s,
    headline: "Two system blocks, cache breakpoint on the first",
    detail: {
      why: "Prompt caching is a prefix match, so anything that varies has to come after the breakpoint. Today's date sits in block 2 for exactly this reason — put it in block 1 and the cache never hits again.",
      block_1: `role instructions + the full policy handbook — ${frozenChars.toLocaleString()} characters, byte-identical on every request, cache_control: ephemeral`,
      block_2: `${volatileChars} characters of per-request context (date, channel${product ? ", product" : ""}${orderId ? ", order" : ""}) — after the breakpoint, never cached`,
    },
  };

  // ---- 4. Constrain the output -----------------------------------------
  s = mark();
  yield { type: "stage", id: "schema", status: "running" };
  yield {
    type: "stage",
    id: "schema",
    status: "done",
    ms: mark() - s,
    headline: `${Object.keys(TriageSchema.shape).length} fields, enforced by the API`,
    detail: {
      why: "The prompt never asks for JSON. A schema is attached to the request and the API constrains generation to it, so there is no parsing, no repair loop, and no 'please respond only with JSON'.",
      fields: schemaFieldSummary(),
    },
  };

  // ---- 5. Call the model ------------------------------------------------
  s = mark();
  yield {
    type: "stage",
    id: "model",
    status: "running",
    detail: { model: MODEL, effort: "low", max_tokens: MAX_TOKENS },
  };

  let response;
  try {
    response = await callClaude(system, message);
  } catch (err) {
    console.error("model call failed", err);
    yield { type: "stage", id: "model", status: "failed", ms: mark() - s };
    yield {
      type: "failure",
      id: "model",
      status: 502,
      error: "upstream_error",
      detail: "We could not classify that just now. Try again shortly.",
    };
    return;
  }
  const modelMs = mark() - s;

  yield {
    type: "stage",
    id: "model",
    status: "done",
    ms: modelMs,
    headline: `${MODEL} answered in ${(modelMs / 1000).toFixed(1)}s`,
    detail: {
      why: "Every other stage on this page takes single-digit milliseconds. This one is the whole latency budget, which is why effort is set to low for a bounded classification on a hot path.",
      effort: "low",
      stop_reason: response.stop_reason,
    },
  };

  // ---- 6. Validate the response ----------------------------------------
  s = mark();
  yield { type: "stage", id: "parse", status: "running" };

  if (!response.parsed_output) {
    yield { type: "stage", id: "parse", status: "failed", ms: mark() - s };
    yield {
      type: "failure",
      id: "parse",
      status: 502,
      error: "unparseable_output",
      detail: "The reply did not validate against the schema.",
    };
    return;
  }

  yield {
    type: "stage",
    id: "parse",
    status: "done",
    ms: mark() - s,
    headline: "Validated against the schema",
    detail: {
      why: "parsed_output is typed and can still be null — usually when generation was cut short. Production code checks it rather than asserting past it.",
      category: response.parsed_output.category,
      confidence: response.parsed_output.confidence,
    },
  };

  // ---- 7. Account for it ------------------------------------------------
  s = mark();
  const u = response.usage;
  // Rates come from the generated table, not from literals typed in here.
  // Its source is MODEL_CATALOG in the API repo's src/config.ts; regenerate
  // with `npm run sync:storefront`. Hardcoding $5/$25 was how this file
  // quietly kept reporting Opus prices no matter what TRIAGE_MODEL said.
  const pricing = pricingFor(MODEL);
  const inRate = pricing.inputPerMTok / 1_000_000;
  const outRate = pricing.outputPerMTok / 1_000_000;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cost =
    u.input_tokens * inRate +
    cacheWrite * inRate * pricing.cacheWriteMultiplier +
    cacheRead * inRate * pricing.cacheReadMultiplier +
    u.output_tokens * outRate;
  const uncached =
    (u.input_tokens + cacheWrite + cacheRead) * inRate + u.output_tokens * outRate;

  yield {
    type: "stage",
    id: "account",
    status: "done",
    ms: mark() - s,
    headline: cacheRead > 0
      ? `$${cost.toFixed(4)} — cache hit saved $${(uncached - cost).toFixed(4)}`
      : `$${cost.toFixed(4)} — cache written for next time`,
    detail: {
      why: "Total input is the sum of three fields, not just input_tokens. Log only the first and a cached workload looks almost free right up until the cache breaks.",
      input_tokens: u.input_tokens,
      cache_creation_input_tokens: cacheWrite,
      cache_read_input_tokens: cacheRead,
      output_tokens: u.output_tokens,
      cost_without_caching: `$${uncached.toFixed(4)}`,
    },
  };

  // ---- 8. Persist, but only if a human is needed -------------------------
  //
  // This stage is the one-generator-two-consumers design earning its keep: it
  // was added in exactly one place and both the SSE route and the JSON route
  // picked it up without either being edited. If a stage moves, it moves once.
  //
  // Note what is NOT stored. Tickets that do not require a human are
  // classified and discarded, as they always were — a demo should not
  // accumulate the public's messages just because it now has somewhere to put
  // them. Storage is a consequence of escalation, not of submission.
  s = mark();
  yield { type: "stage", id: "persist", status: "running" };

  let ticketId: string | undefined;
  const needsHuman = response.parsed_output.requires_human;

  if (!needsHuman) {
    yield {
      type: "stage",
      id: "persist",
      status: "done",
      ms: mark() - s,
      headline: "Nothing to store — no human needed",
      detail: {
        why: "requires_human is false, so the classification is the whole answer and the message is discarded. Storing every submission would mean holding the public's support text for no operational reason.",
        requires_human: false,
      },
    };
  } else if (!HAS_MONGO) {
    // A missing database must not fail the customer's submission. They still
    // get their classification; we simply cannot queue it.
    yield {
      type: "stage",
      id: "persist",
      status: "done",
      ms: mark() - s,
      headline: "Escalation skipped — no database configured",
      detail: {
        why: "MONGODB_URI is unset, so there is nowhere to queue this. The classification still returns: a storage outage should degrade the queue, not the answer.",
      },
    };
  } else {
    try {
      // The REDACTED text, never the raw message. Same decision as the
      // boundary redaction, applied one layer out — once you persist, the
      // only question that matters is what is in the database.
      const { text: redactedMessage, redactions } = redactPII(message);
      ticketId = await insertEscalation({
        channel: "web form",
        message_redacted: redactedMessage,
        redactions,
        triage: response.parsed_output,
        model: MODEL,
        cost_usd: Math.round(cost * 1e6) / 1e6,
      });

      yield {
        type: "stage",
        id: "persist",
        status: "done",
        ms: mark() - s,
        headline: `Queued for a human as ${ticketId}`,
        detail: {
          why: "requires_human was true, so the ticket is now in the reviewer queue rather than in a log line. A flag nobody routes on is a comment.",
          ticket_id: ticketId,
          escalation_reason: response.parsed_output.escalation_reason,
          redactions_before_storage: redactions.length,
          retention: "deleted after 30 days by a TTL index",
        },
      };
    } catch (err) {
      // Same principle as above: the customer's answer does not depend on our
      // queue working. Report the stage as failed and continue to the result.
      console.error("escalation insert failed", err);
      yield {
        type: "stage",
        id: "persist",
        status: "failed",
        ms: mark() - s,
        headline: "Could not queue this for a human",
        detail: {
          why: "The classification succeeded and the store did not. The customer still gets an answer; the operations team is the one with a problem, which is the correct place for it to surface.",
        },
      };
    }
  }

  // Fire-and-forget: telemetry must never be able to fail a customer's
  // request, and by this point the classification has already succeeded.
  recordCall({
    category: response.parsed_output.category,
    cacheHit: cacheRead > 0,
    escalated: needsHuman,
    costUsd: Math.round(cost * 1e6) / 1e6,
  });

  yield {
    type: "result",
    triage: response.parsed_output,
    cost_usd: Math.round(cost * 1e6) / 1e6,
    cache_hit: cacheRead > 0,
    latency_ms: modelMs,
    total_ms: Date.now() - t0,
    ticket_id: ticketId,
  };
}
