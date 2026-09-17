import { houseClient } from "@/lib/anthropicClient";
import { checkLimits, clientIp } from "@/lib/ratelimit";
import { redactSecrets } from "@/lib/secrets";
import { parseExplorerBody } from "@/lib/explorerPolicy";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The explorer's Preflight button: `POST /v1/messages/count_tokens` for the body on screen.
 *
 * Counting is free, so it runs on the house key for everyone and outside the credit gate. It is still rate limited,
 * because a free endpoint on our key is a free endpoint for anyone with a loop. Only the fields that change the count
 * are forwarded; `max_tokens`, `stream` and `stop_sequences` shape the output, and the count is of the input.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = parseExplorerBody(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: "invalid_request", detail: parsed.detail }, { status: 400 });

  const verdict = await checkLimits(clientIp(request.headers), "count", { daily: false });
  if (!verdict.ok) {
    return Response.json(
      { error: "rate_limited", detail: "Too many preflights. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } },
    );
  }

  const { model, messages, system, tools, tool_choice, thinking, output_config } = parsed.body;
  const t0 = performance.now();
  try {
    const result = await houseClient().messages.countTokens({
      model,
      messages,
      system,
      tools,
      tool_choice,
      thinking,
      output_config,
    } as unknown as Anthropic.MessageCountTokensParams);
    return Response.json({ input_tokens: result.input_tokens, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    if (err instanceof Anthropic.APIError && err.status) {
      return Response.json({ error: "api_error", status: err.status, body: err.error ?? null }, { status: 200 });
    }
    console.error("explorer count failed", redactSecrets(err));
    return Response.json({ error: "count_failed", detail: "count_tokens did not answer." }, { status: 502 });
  }
}
