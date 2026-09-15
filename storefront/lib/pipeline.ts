import "server-only";
import { z } from "zod";
import { AiGateError, guardAi, keyError, settle, type Funding, type GateCode, type Meter } from "./funding";
import { redactSecrets } from "./secrets";
import { costMicros, microsToUsd, uncachedCostMicros } from "./cost";
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
  error: string | GateCode;
  detail: string;
  /**
   * Seconds until a retry could succeed, when we know. The limiter has always
   * computed this; until now nothing carried it out of the pipeline, so a 429
   * told the client to back off without saying for how long.
   */
  retryAfterSec?: number;
  /** Present on a credit refusal, so the page can show where the learner stands. */
  meter?: Meter | null;
}

/** The learner's credit after this call. Absent when nobody is metered (BYOK_MODE=off). */
export interface MeterEvent {
  type: "meter";
  meter: Meter;
}

export type PipelineEvent = StageEvent | ResultEvent | FailureEvent | MeterEvent;

const Input = z.object({
  message: z.string().min(10).max(MAX_MESSAGE_CHARS),
  product: z.string().max(120).optional(),
  orderId: z.string().max(40).optional(),
});

export async function* runPipeline(
  raw: unknown,
  request: Request,
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

  // ---- 2. Who pays ------------------------------------------------------
  s = mark();
  yield { type: "stage", id: "ratelimit", status: "running" };

  let funding: Funding;
  try {
    funding = await guardAi(request, "support", "classify");
  } catch (error) {
    if (!(error instanceof AiGateError)) throw error;
    // Counted separately: a blocked request has no category and no cost, and
    // folding it into `calls` would quietly deflate the mean cost per call.
    recordBlocked();
    yield { type: "stage", id: "ratelimit", status: "failed", ms: mark() - s };
    yield {
      type: "failure",
      id: "ratelimit",
      status: error.status,
      error: error.code,
      retryAfterSec: error.retryAfterSec,
      detail: error.detail,
      meter: error.meter,
    };
    return;
  }

  yield {
    type: "stage",
    id: "ratelimit",
    status: "done",
    ms: mark() - s,
    headline:
      funding.kind === "byok"
        ? "Allowed. Running on your own API key"
        : funding.kind === "trial"
          ? "Allowed. Worst case reserved from your free credit"
          : "Allowed. Within this connection's limits",
    detail: {
      why:
        funding.kind === "trial"
          ? "A call's cost is unknown until it returns, so the most it could cost is reserved first — one conditional $inc that only matches if it fits — and the difference is refunded after. Two requests racing for the last dollar cannot both win."
          : "A public form that calls a frontier model is an uncapped bill. Every call passes a per-connection window in MongoDB, an atomic increment on a document that expires itself.",
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
    response = await callClaude(system, message, { client: funding.client });
  } catch (err) {
    const meter = await settle(funding, 0);
    const refused = await keyError(funding, err);
    if (!refused) console.error("model call failed", redactSecrets(err));
    yield { type: "stage", id: "model", status: "failed", ms: mark() - s };
    yield {
      type: "failure",
      id: "model",
      status: refused?.status ?? 502,
      error: refused?.code ?? "upstream_error",
      detail: refused?.detail ?? "We could not classify that just now. Try again shortly.",
      meter,
    };
    return;
  }
  // Settled the moment the bill is known, before anything below can fail: a
  // reply that does not validate was still paid for.
  const settled = settle(funding, costMicros(response.usage, response.model));
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
    const meter = await settled;
    if (meter) yield { type: "meter", meter };
    yield { type: "stage", id: "parse", status: "failed", ms: mark() - s };
    // Three different failures arrive as null. Say which one it was.
    const refused = response.stop_reason === "refusal";
    const truncated = response.stop_reason === "max_tokens";
    yield {
      type: "failure",
      id: "parse",
      status: refused ? 422 : 502,
      error: refused ? "refused" : truncated ? "truncated_output" : "unparseable_output",
      detail: refused
        ? "The model declined this request."
        : truncated
          ? "Generation hit max_tokens before the JSON was complete."
          : "The reply did not validate against the schema.",
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
      why: "parsed_output is typed and can still be null — when the reply has no text to parse, most often a refusal. Text that does not validate makes parse() throw instead. Production code handles both rather than asserting past it.",
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
  // Priced by the model that answered, not the one we asked for (Decision 9).
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const micros = costMicros(u, response.model);
  const cost = microsToUsd(micros);
  const uncached = microsToUsd(uncachedCostMicros(u, response.model));

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
        cost_usd: cost,
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
    surface: "support",
    category: response.parsed_output.category,
    cacheHit: cacheRead > 0,
    escalated: needsHuman,
    costMicros: micros,
  });

  const meter = await settled;
  if (meter) yield { type: "meter", meter };

  yield {
    type: "result",
    triage: response.parsed_output,
    cost_usd: cost,
    cache_hit: cacheRead > 0,
    latency_ms: modelMs,
    total_ms: Date.now() - t0,
    ticket_id: ticketId,
  };
}
