/**
 * POST /v1/estimate — token counting and cost projection, without inference.
 *
 * CAPABILITY DEMONSTRATED: `messages.countTokens()`. It runs the real
 * tokenizer server-side and costs nothing, which makes it the right tool for:
 *   - Admission control (reject a 900K-token payload before you pay for it).
 *   - Capacity planning ("what does 100K tickets/month actually cost?").
 *   - Verifying that a cache prefix clears the ~1024-token minimum.
 *
 * TEACHING NOTE: do NOT estimate Claude token counts with `tiktoken`, a
 * chars/4 heuristic, or a word count. Those are calibrated to other models'
 * tokenizers and drift by 15-35% on real payloads. There is an endpoint;
 * use the endpoint.
 */
import { Hono } from "hono";
import { z } from "zod";
import { anthropic } from "../anthropic.js";
import { MODEL, PRICING } from "../config.js";
import { buildSystem, volatileContext } from "../prompts.js";
import { toHttpError } from "../lib/errors.js";

export const estimateRoute = new Hono();

const EstimateInput = z.object({
  message: z.string().min(1).max(200_000),
  role: z.enum(["triage", "resolve", "draft"]).default("triage"),
  /** Projected monthly volume, used for the capacity-planning figures. */
  monthly_volume: z.number().int().positive().max(100_000_000).default(10_000),
  /** Rough expected output size, since we aren't generating anything here. */
  expected_output_tokens: z.number().int().positive().max(128_000).default(400),
});

estimateRoute.post("/", async (c) => {
  const parsedBody = EstimateInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return c.json({ error: "invalid_request", detail: parsedBody.error.issues }, 400);
  }
  const { message, role, monthly_volume, expected_output_tokens } = parsedBody.data;

  try {
    const system = buildSystem(role, volatileContext({ channel: "email" }));

    // Count the full request and the cacheable prefix separately, so callers
    // can see how much of their input is eligible for the 90% cache discount.
    const [full, prefixOnly] = await Promise.all([
      anthropic.messages.countTokens({
        model: MODEL,
        system,
        messages: [{ role: "user", content: message }],
      }),
      anthropic.messages.countTokens({
        model: MODEL,
        system: [system[0]!],
        messages: [{ role: "user", content: "." }],
      }),
    ]);

    const inRate = PRICING.inputPerMTok / 1_000_000;
    const outRate = PRICING.outputPerMTok / 1_000_000;

    const cacheablePrefix = prefixOnly.input_tokens;
    const perRequestVariable = full.input_tokens - cacheablePrefix;

    const coldCost = full.input_tokens * inRate + expected_output_tokens * outRate;
    const warmCost =
      cacheablePrefix * inRate * PRICING.cacheReadMultiplier +
      perRequestVariable * inRate +
      expected_output_tokens * outRate;

    return c.json({
      tokens: {
        total_input: full.input_tokens,
        cacheable_prefix: cacheablePrefix,
        per_request_variable: perRequestVariable,
        assumed_output: expected_output_tokens,
        // Below ~1024 tokens the API silently declines to cache the prefix.
        prefix_meets_cache_minimum: cacheablePrefix >= 1024,
      },
      cost_usd: {
        cold_request: round6(coldCost),
        warm_request: round6(warmCost),
        savings_per_warm_request: round6(coldCost - warmCost),
      },
      monthly_projection_usd: {
        volume: monthly_volume,
        without_caching: round2(coldCost * monthly_volume),
        with_caching: round2(warmCost * monthly_volume),
        savings: round2((coldCost - warmCost) * monthly_volume),
      },
      meta: { model: MODEL, role, note: "No inference was performed; countTokens is free." },
    });
  } catch (err) {
    const { status, body } = toHttpError(err);
    return c.json(body, status as 400);
  }
});

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const round2 = (n: number) => Math.round(n * 100) / 100;
