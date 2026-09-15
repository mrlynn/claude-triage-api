import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Where every Claude client in the storefront comes from.
 *
 * There used to be four, one per call file, each reading ANTHROPIC_API_KEY
 * from the environment. That is fine while one key pays for everything. It
 * stops being fine the moment a learner can bring their own (docs/byok): the
 * key becomes a property of the request, not of the module, so the call sites
 * take a client instead of reaching for a constant.
 */

const cache = globalThis as unknown as { __houseAnthropic?: Anthropic };

/**
 * The site owner's key. Module-level and cached on `globalThis`, like the
 * Mongo client, so a warm instance reuses it rather than rebuilding per call.
 *
 * Retries are set per request by each caller (`{ maxRetries }`), because they
 * differ: the live preview retries once, since the next keystroke supersedes
 * it; everything else retries twice.
 */
export function houseClient(): Anthropic {
  return (cache.__houseAnthropic ??= new Anthropic({ maxRetries: 2 }));
}

/**
 * A learner's key. Built per request and never cached: a cache would keep a
 * plaintext key alive in a warm instance long after the request that needed it.
 */
export function clientForKey(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 2 });
}
