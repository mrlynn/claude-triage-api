/**
 * POST /v1/estimate — token counting and cost projection, without inference.
 *
 * CAPABILITY DEMONSTRATED: `messages.countTokens()`. It runs the real
 * tokenizer server-side and costs nothing, which makes it the right tool for:
 *   - Admission control (reject a 900K-token payload before you pay for it).
 *   - Capacity planning ("what does 100K tickets/month actually cost?").
 *   - Verifying that a cache prefix clears the configured model's caching
 *     minimum — which is a per-model number, not a constant (see config.ts).
 *
 * TEACHING NOTE: do NOT estimate Claude token counts with `tiktoken`, a
 * chars/4 heuristic, or a word count. Those are calibrated to other models'
 * tokenizers and drift by 15-35% on real payloads. There is an endpoint;
 * use the endpoint.
 */
import { Hono } from "hono";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropic } from "../anthropic.js";
import { MODEL, cacheMinimumFor, pricingFor } from "../config.js";
import { buildSystem, volatileContext } from "../prompts.js";
import { toHttpError } from "../lib/errors.js";
import { createTools } from "../tools/index.js";

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

    // Tools render BEFORE system in a request, so they are part of what you
    // pay for on every resolve call. Omitting them here — which this route
    // used to do — understated the resolve estimate by the entire tool block.
    // We strip the executable halves and count the definitions the API sees.
    // (The beta tool-runner's union also covers server-side tools that carry
    // no input_schema, so narrow to the custom ones before projecting. Lab 9
    // replaces this with a provider-neutral definition list.)
    const tools: Anthropic.Tool[] | undefined =
      role === "resolve"
        ? createTools([])
            .filter((t) => "input_schema" in t && "description" in t)
            .map((t) => {
              const custom = t as unknown as Anthropic.Tool;
              return {
                name: custom.name,
                description: custom.description,
                input_schema: custom.input_schema,
              };
            })
        : undefined;

    // Count the full request and the cacheable prefix separately, so callers
    // can see how much of their input is eligible for the 90% cache discount.
    const [full, prefixOnly] = await Promise.all([
      anthropic.messages.countTokens({
        model: MODEL,
        system,
        ...(tools ? { tools } : {}),
        messages: [{ role: "user", content: message }],
      }),
      anthropic.messages.countTokens({
        model: MODEL,
        system: [system[0]!],
        ...(tools ? { tools } : {}),
        messages: [{ role: "user", content: "." }],
      }),
    ]);

    const pricing = pricingFor(MODEL);
    const inRate = pricing.inputPerMTok / 1_000_000;
    const outRate = pricing.outputPerMTok / 1_000_000;

    const cacheablePrefix = prefixOnly.input_tokens;
    const perRequestVariable = full.input_tokens - cacheablePrefix;

    // Per-model, NOT a constant: 512 on Opus 5, 4096 on Haiku 4.5. A prefix
    // that caches on the flagship can silently stop caching the moment you
    // change tier, which is why this is read from the catalog rather than
    // written as a literal here.
    const cacheMinimum = cacheMinimumFor(MODEL);
    const meetsMinimum = cacheablePrefix >= cacheMinimum;

    const coldCost = full.input_tokens * inRate + expected_output_tokens * outRate;
    // If the prefix is under this model's minimum there is no warm request to
    // project: every call pays the cold rate forever. Reporting a warm figure
    // anyway would be the exact over-promise this endpoint exists to prevent.
    const warmCost = meetsMinimum
      ? cacheablePrefix * inRate * pricing.cacheReadMultiplier +
        perRequestVariable * inRate +
        expected_output_tokens * outRate
      : coldCost;

    return c.json({
      tokens: {
        total_input: full.input_tokens,
        cacheable_prefix: cacheablePrefix,
        per_request_variable: perRequestVariable,
        assumed_output: expected_output_tokens,
        // Below the minimum the API silently declines to cache the prefix:
        // HTTP 200, correct answer, cache_creation_input_tokens: 0.
        cache_minimum_tokens: cacheMinimum,
        prefix_meets_cache_minimum: meetsMinimum,
        // Only populated for role "resolve"; the other roles send no tools.
        tools_counted: tools?.length ?? 0,
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
      meta: {
        model: MODEL,
        role,
        note: "No inference was performed; countTokens is free.",
        ...(meetsMinimum
          ? {}
          : {
              warning:
                `The cacheable prefix is ${cacheablePrefix} tokens, below the ` +
                `${cacheMinimum}-token minimum for ${MODEL}. The cache_control ` +
                `breakpoint will be accepted and ignored: no error, no cache. ` +
                `Warm and cold costs above are therefore identical.`,
            }),
      },
    });
  } catch (err) {
    const { status, body } = toHttpError(err);
    return c.json(body, status as 400);
  }
});

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const round2 = (n: number) => Math.round(n * 100) / 100;
