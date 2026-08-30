/**
 * Request construction, in one place.
 *
 * TEACHING NOTE: until this file existed, every request body was built inline
 * inside its route handler. That reads fine — right up until you want to send
 * the SAME request somewhere other than the route:
 *
 *   - the Batches API, which takes request bodies and no route (Lab 9)
 *   - `count_tokens`, which must see the EXACT body to be accurate (Lab 5)
 *   - an eval sweep that varies only the model (Lab 7)
 *
 * Each of those is a fork of the route handler if the body is trapped inside
 * it. So the body-building moved out and the routes call these. The rule that
 * falls out: a route handler should own HTTP concerns, not prompt assembly.
 *
 * CACHE WARNING: these functions are on the cached path. `buildSystem` places
 * the breakpoint after the frozen role + handbook, so anything you add here
 * before that block invalidates the prefix for every caller at once.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, MAX_TOKENS, EFFORT, specFor } from "../config.js";
import { TriageSchema, type Ticket } from "../schemas.js";
import { buildSystem, volatileContext } from "../prompts.js";
import { wrapUntrusted } from "./untrusted.js";

/** The SDK's own union, so an invalid effort is a compile error, not a 400. */
export type Effort = NonNullable<Anthropic.OutputConfig["effort"]>;

/** Overrides an eval sweep or a batch job needs; routes pass none of these. */
export interface BuildOpts {
  /** Defaults to `MODEL`. Lab 7 varies this per case. */
  model?: string;
  /** Defaults to the per-route value in `EFFORT`. Dropped on models that reject it. */
  effort?: Effort;
  maxTokens?: number;
}

/**
 * Applies `output_config` in a way the target model actually accepts.
 *
 * Haiku 4.5 returns a 400 for `effort`. Rather than making every caller
 * remember that, we consult the catalog and drop the field. The dropped-effort
 * case is reported by `effortApplied` so an eval can label the run honestly
 * instead of quietly comparing a low-effort model against a no-effort one.
 */
export function outputConfigFor(
  model: string,
  effort: Effort,
): { config: { effort?: Effort }; effortApplied: boolean } {
  if (!specFor(model).supportsEffort) {
    return { config: {}, effortApplied: false };
  }
  return { config: { effort }, effortApplied: true };
}

/**
 * Applies `thinking` in a way the target model actually accepts.
 *
 * The sibling of `outputConfigFor`, and it exists for the same reason: Haiku
 * 4.5 predates adaptive thinking and returns
 * `adaptive thinking is not supported on this model` — a 400, not a
 * degradation. The catalog already knew this (`supportsAdaptiveThinking`); for
 * a while nothing read the flag, so `/v1/draft` and `/v1/resolve` sent
 * adaptive thinking to every model and simply broke on the cheap tier.
 *
 * `display: "summarized"` is opt-in. Without it, thinking blocks stream with
 * EMPTY text on Opus 5 — from a UI's point of view that looks like a long
 * silent pause before the answer appears.
 *
 * TEACHING NOTE: the honest answer for a model that cannot do this is to send
 * nothing, not to translate into the older `budget_tokens` shape. A silent
 * translation would make two tiers look comparable when they are running
 * different reasoning configurations, which is exactly the kind of hidden
 * variable Lab 7 is about.
 */
export function thinkingFor(
  model: string,
): { thinking?: { type: "adaptive"; display: "summarized" }; thinkingApplied: boolean } {
  if (!specFor(model).supportsAdaptiveThinking) {
    return { thinkingApplied: false };
  }
  return { thinking: { type: "adaptive", display: "summarized" }, thinkingApplied: true };
}

/**
 * The `/v1/triage` request body.
 *
 * Kept byte-identical to what the route sent before extraction — the cached
 * prefix is a prefix match, so "equivalent" is not good enough here.
 *
 * The return type is INFERRED, not annotated, and that is load-bearing.
 * `zodOutputFormat(TriageSchema)` returns an `AutoParseableOutputFormat`
 * carrying the schema's type as a generic parameter, which is what lets
 * `messages.parse()` type `parsed_output` as `TriageResult | null`. Annotating
 * this function as `MessageCreateParamsNonStreaming` erases that generic and
 * silently collapses `parsed_output` to `never` — the route still compiles and
 * still runs, and you have quietly thrown away the entire point of Lab 2.
 * Widening a return type is not a free "tidier signature" here.
 */
export function buildTriageRequest(ticket: Ticket, opts: BuildOpts = {}) {
  const model = opts.model ?? MODEL;
  const { config } = outputConfigFor(model, opts.effort ?? EFFORT.triage);

  return {
    model,
    max_tokens: opts.maxTokens ?? MAX_TOKENS.nonStreaming,
    system: buildSystem(
      "triage",
      volatileContext({
        channel: ticket.channel,
        customerEmail: ticket.customer_email,
      }),
    ),
    output_config: {
      // Effort and format both live inside output_config. Triage is a
      // bounded classification on the hot path, so we buy the cheap tier.
      ...config,
      format: zodOutputFormat(TriageSchema),
    },
    messages: [
      {
        role: "user" as const,
        content: userContent(ticket),
      },
    ],
  };
}

/**
 * The user turn: a plain string, or blocks when a photo came with the ticket.
 *
 * TEACHING NOTE — three decisions worth arguing about.
 *
 * 1. **A ticket with no attachment produces the identical STRING it always
 *    did**, not a one-element block array. Those are semantically equivalent
 *    to the API and not equivalent to the cache: the cached prefix is a prefix
 *    match, and every existing caller would have paid a fresh cache write the
 *    day this function shipped. Backwards compatibility here is a cost
 *    property, not a style preference.
 *
 * 2. **The image goes BEFORE the text.** Anthropic's guidance is that image-
 *    first ordering performs better, and the practical reason is the same one
 *    Lab 2 makes about `.describe()`: the model reads in order, and the
 *    instruction lands better when the thing it refers to is already in view.
 *
 * 3. **The image is NOT wrapped by `wrapUntrusted`.** It cannot be — escaping
 *    is a string operation. That is worth sitting with rather than skipping,
 *    because it means an attachment is untrusted content entering the prompt
 *    through a door the Lab 8 defence does not cover: text rendered INTO an
 *    image bypasses `wrapUntrusted` entirely. The deterministic controls still
 *    hold — `enforceAuthority` re-derives money from the tool trace and does
 *    not care where the model got an idea — and that is precisely the argument
 *    for ranking defences by kind. A control that reads the trace is unmoved
 *    by an attack it cannot see.
 */
function userContent(ticket: Ticket) {
  const text = `Classify this inbound ${ticket.channel} message.\n\n${wrapUntrusted(ticket.message)}`;
  if (!ticket.attachment) return text;

  return [
    {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: ticket.attachment.media_type,
        data: ticket.attachment.data,
      },
    },
    { type: "text" as const, text },
  ];
}
