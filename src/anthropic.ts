import Anthropic from "@anthropic-ai/sdk";

/**
 * One client for the whole process.
 *
 * TEACHING NOTE: the zero-arg constructor resolves credentials from the
 * environment (ANTHROPIC_API_KEY, then ANTHROPIC_AUTH_TOKEN, then an
 * `ant auth login` profile). Never hardcode a key, and never construct a new
 * client per request — the SDK pools HTTP connections and owns retry state.
 *
 * Defaults worth knowing: `timeout` is 10 minutes (MILLISECONDS in the TS
 * SDK — seconds in Python), `maxRetries` is 2 and covers 408/409/429/5xx plus
 * connection errors. Wall-clock worst case is timeout x (maxRetries + 1).
 */
export const anthropic = new Anthropic({
  maxRetries: 3,
});

export function assertCredentials(): void {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error(
      "No Anthropic credentials found. Copy .env.example to .env and set ANTHROPIC_API_KEY, " +
        "or export it in your shell.",
    );
  }
}

export default Anthropic;
