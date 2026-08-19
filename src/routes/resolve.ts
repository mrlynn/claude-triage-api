/**
 * POST /v1/resolve — tool use / agentic loop.
 *
 * CAPABILITY DEMONSTRATED: Claude decides which of our systems to query, in
 * what order, and when it has enough information to stop. The SDK's tool
 * runner drives the request -> execute -> feed-back-result loop so we don't
 * hand-write `while (stop_reason === "tool_use")`.
 *
 * Three things this route does that toy examples usually skip:
 *   1. Caps `max_iterations` — an uncapped agent loop is an uncapped bill.
 *   2. Accumulates usage across EVERY turn, not just the last one. The final
 *      message's usage covers only the final request; a 5-turn loop that
 *      reports the last turn's usage under-reports cost by roughly 5x.
 *   3. Returns the tool trace, so a reviewer can see what the model actually
 *      looked at before deciding. "Show your work" is an auditability
 *      requirement in support tooling, not a nicety.
 */
import { Hono } from "hono";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic } from "../anthropic.js";
import { MODEL, MAX_TOKENS, EFFORT } from "../config.js";
import { ResolutionSchema, TicketInput } from "../schemas.js";
import { buildSystem, volatileContext } from "../prompts.js";
import { summarizeUsage, sumUsage, type UsageReport } from "../lib/usage.js";
import { toHttpError } from "../lib/errors.js";
import { createTools, type ToolCallRecord } from "../tools/index.js";

export const resolveRoute = new Hono();

/** Hard ceiling on agent turns. Tune deliberately; never leave it unset. */
const MAX_ITERATIONS = 8;

resolveRoute.post("/", async (c) => {
  const parsedBody = TicketInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return c.json({ error: "invalid_request", detail: parsedBody.error.issues }, 400);
  }
  const ticket = parsedBody.data;
  const startedAt = Date.now();

  // The trace array is closed over by every tool, so calls land here in order.
  const trace: ToolCallRecord[] = [];
  const usagePerTurn: UsageReport[] = [];

  try {
    const runner = anthropic.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: MAX_TOKENS.nonStreaming,
      max_iterations: MAX_ITERATIONS,
      system: buildSystem(
        "resolve",
        volatileContext({
          channel: ticket.channel,
          customerEmail: ticket.customer_email,
        }),
      ),
      output_config: {
        effort: EFFORT.resolve,
        // Constrains the FINAL answer. Intermediate turns still emit tool_use
        // blocks normally — the format applies to the text Claude settles on.
        format: betaZodOutputFormat(ResolutionSchema),
      },
      tools: createTools(trace),
      messages: [
        {
          role: "user",
          content:
            `Determine what Northwind should do about this ${ticket.channel} message. ` +
            `Look up the facts before you decide.\n\n` +
            `<customer_message>\n${ticket.message}\n</customer_message>`,
        },
      ],
    });

    // Iterating the runner (rather than just awaiting it) is what lets us
    // observe each turn. Awaiting `runner` directly would give us the final
    // message and silently discard intermediate usage.
    for await (const message of runner) {
      usagePerTurn.push(summarizeUsage(message.usage));

      // A server-side tool can end a turn with pause_turn. The runner only
      // auto-continues after a CLIENT tool returns a result, so a paused turn
      // would otherwise end the loop with a silently truncated answer.
      if (message.stop_reason === "pause_turn") {
        runner.pushMessages({ role: "assistant", content: message.content });
      }
    }

    const final = await runner.done();

    // `toolRunner` has no `parsed_output` — that convenience belongs to
    // `messages.parse()`. With `output_config.format` set, the final text is
    // schema-conformant JSON, so we validate it ourselves.
    const text = final.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");

    const validated = ResolutionSchema.safeParse(safeJson(text));
    if (!validated.success) {
      return c.json(
        {
          error: "unparseable_output",
          detail: "The agent's final message did not validate against the resolution schema.",
          stop_reason: final.stop_reason,
          iterations: usagePerTurn.length,
          raw: text.slice(0, 2000),
        },
        502,
      );
    }

    return c.json({
      resolution: validated.data,
      tool_trace: trace,
      meta: {
        model: final.model,
        stop_reason: final.stop_reason,
        iterations: usagePerTurn.length,
        hit_iteration_cap: usagePerTurn.length >= MAX_ITERATIONS,
        latency_ms: Date.now() - startedAt,
        usage_total: sumUsage(usagePerTurn),
        usage_per_turn: usagePerTurn,
      },
    });
  } catch (err) {
    const { status, body } = toHttpError(err);
    return c.json(body, status as 400);
  }
});

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
