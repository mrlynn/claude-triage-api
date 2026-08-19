/**
 * POST /v1/triage — structured outputs.
 *
 * CAPABILITY DEMONSTRATED: constrained generation. Claude is not asked to
 * "reply in JSON"; the schema is enforced by the API, and the SDK validates
 * and types the result for us.
 *
 * The two moving parts:
 *   output_config.format = zodOutputFormat(TriageSchema)  <- the constraint
 *   client.messages.parse(...)                            <- validate + type
 *
 * `parse()` returns `parsed_output`, which is `TriageResult | null`. It is
 * null when parsing failed — guard it, do not assert past it in production.
 */
import { Hono } from "hono";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "../anthropic.js";
import { MODEL, MAX_TOKENS, EFFORT } from "../config.js";
import { TriageSchema, TicketInput } from "../schemas.js";
import { buildSystem, volatileContext } from "../prompts.js";
import { summarizeUsage } from "../lib/usage.js";
import { toHttpError } from "../lib/errors.js";

export const triageRoute = new Hono();

triageRoute.post("/", async (c) => {
  const parsedBody = TicketInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return c.json(
      { error: "invalid_request", detail: parsedBody.error.issues },
      400,
    );
  }
  const ticket = parsedBody.data;
  const startedAt = Date.now();

  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS.nonStreaming,
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
        effort: EFFORT.triage,
        format: zodOutputFormat(TriageSchema),
      },
      messages: [
        {
          role: "user",
          content: `Classify this inbound ${ticket.channel} message.\n\n<customer_message>\n${ticket.message}\n</customer_message>`,
        },
      ],
    });

    if (!response.parsed_output) {
      return c.json(
        {
          error: "unparseable_output",
          detail: "The model response did not validate against the triage schema.",
          stop_reason: response.stop_reason,
        },
        502,
      );
    }

    return c.json({
      triage: response.parsed_output,
      meta: {
        model: response.model,
        stop_reason: response.stop_reason,
        latency_ms: Date.now() - startedAt,
        usage: summarizeUsage(response.usage),
      },
    });
  } catch (err) {
    const { status, body } = toHttpError(err);
    return c.json(body, status as 400);
  }
});
