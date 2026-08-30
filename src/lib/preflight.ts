/**
 * Boot-time configuration checks.
 *
 * TEACHING NOTE — why this file exists, and why a test was not enough.
 *
 * The service shipped for months with a prompt-cache breakpoint that did
 * nothing on the cheap tier: the frozen prefix is ~2.7K tokens and Haiku 4.5
 * will not cache anything under 4096. Nothing errored. Answers stayed correct.
 * The only symptom was a cost figure that got printed in a lab's comparison
 * table and read as a sensible result for months.
 *
 * Every instrument that could have caught it failed for the same reason:
 *
 *   - the smoke test asserts on this correctly, but only when someone runs it
 *     with TRIAGE_MODEL set, and nobody did
 *   - CI runs smoke against the default model only, so it tests one tier
 *   - code review would need someone to have the per-model minimums memorized
 *   - a dashboard shows a flat-zero hit rate to whoever is looking, and nobody
 *     looks at a dashboard for a config they believe is fine
 *
 * The common shape: **a check that requires you to have already suspected the
 * problem is not a control.** All four wait on human suspicion. A startup
 * check does not — it fires on its own schedule, on every boot, on whatever
 * model is actually configured, which is the one fact none of the others knew.
 *
 * It is cheap enough to be unarguable. `countTokens` runs the real tokenizer
 * server-side and is not billed, so this costs one round trip and zero dollars.
 */
import { anthropic } from "../anthropic.js";
import { MODEL, cacheMinimumFor } from "../config.js";
import { buildSystem, volatileContext } from "../prompts.js";

export interface PreflightResult {
  model: string;
  prefixTokens: number;
  minimumTokens: number;
  willCache: boolean;
  /** Null when the check could not run (offline, no credentials, API error). */
  error: string | null;
}

/**
 * Measures the frozen prefix against the configured model's caching minimum.
 *
 * Counts ONLY `system[0]` — the frozen block carrying the role text and the
 * handbook, the block that actually holds the `cache_control` breakpoint.
 * Counting the whole request would include the volatile block and the user
 * message, which sit after the breakpoint and are not what the minimum applies
 * to. A check that measures the wrong span would pass while the real prefix
 * fell short, which is the failure it exists to prevent wearing a lab coat.
 */
export async function checkCachePrefix(): Promise<PreflightResult> {
  const minimumTokens = cacheMinimumFor(MODEL);
  const system = buildSystem("triage", volatileContext({ channel: "email" }));

  try {
    const counted = await anthropic.messages.countTokens({
      model: MODEL,
      system: [system[0]!],
      messages: [{ role: "user", content: "." }],
    });
    // countTokens has no way to report "just the system block", so the single
    // "." user message is included in the total. It is a token or two; the
    // comparison has thousands of headroom either way, and subtracting a guess
    // would be less honest than counting one extra token.
    const prefixTokens = counted.input_tokens;
    return {
      model: MODEL,
      prefixTokens,
      minimumTokens,
      willCache: prefixTokens >= minimumTokens,
      error: null,
    };
  } catch (err) {
    return {
      model: MODEL,
      prefixTokens: 0,
      minimumTokens,
      willCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Runs the checks and prints what it found.
 *
 * DEGRADES, never blocks. If the API is unreachable, the key is missing, or
 * the call fails for any other reason, this says so and returns — it does not
 * throw and it does not stop the server. The same principle the datastore
 * follows: a diagnostic that can take production down is a worse bug than the
 * one it diagnoses.
 *
 * Set PREFLIGHT=off to skip it entirely (offline development, a test harness
 * that does not want the round trip).
 */
export async function runPreflight(): Promise<void> {
  if (process.env.PREFLIGHT === "off") return;

  const r = await checkCachePrefix();

  if (r.error) {
    console.warn(
      `  preflight: could not verify the cache prefix (${r.error}).\n` +
        `  Continuing — this check is advisory and never blocks startup.\n`,
    );
    return;
  }

  if (r.willCache) {
    console.log(
      `  cache: prefix ${r.prefixTokens} tokens >= ${r.minimumTokens} minimum ` +
        `for ${r.model} — breakpoint is live.\n`,
    );
    return;
  }

  // The loud path. Deliberately specific about the remedy, because the obvious
  // reading of "prefix too short" is "make the prefix longer", and here that
  // would mean padding a legal document with ~1,300 tokens to win a discount.
  console.warn(
    `\n  ${"!".repeat(68)}\n` +
      `  PREFLIGHT: prompt caching is OFF for this configuration.\n\n` +
      `    model        ${r.model}\n` +
      `    prefix       ${r.prefixTokens} tokens\n` +
      `    minimum      ${r.minimumTokens} tokens\n\n` +
      `  The cache_control breakpoint will be accepted and silently ignored:\n` +
      `  HTTP 200, correct answers, and full input rate on the handbook for\n` +
      `  every request. There is no error to catch and nothing in the response\n` +
      `  body changes.\n\n` +
      `  This is a property of the MODEL, not a bug in the prompt. Do NOT pad\n` +
      `  data/policies.md to clear the minimum. Either run a tier whose minimum\n` +
      `  this prefix clears, or decide deliberately to pay uncached rates and\n` +
      `  write that decision down.\n\n` +
      `  See curriculum/labs/lab-7-choosing-a-model.md.\n` +
      `  ${"!".repeat(68)}\n`,
  );
}
