/**
 * Why `parsed_output` is null, stated as an HTTP response.
 *
 * TEACHING NOTE: know which failure arrives which way. In this SDK,
 * `messages.parse()` does two different things when the output is unusable:
 *
 *  - It THROWS `AnthropicError("Failed to parse structured output…")` when
 *    there IS text but it does not parse or validate: truncated JSON, or a
 *    value the zod schema rejects (including a `.min()`/`.max()` bound, which
 *    the SDK checks client-side because the API does not enforce it). That
 *    path has no response object, so `toHttpError` maps it to 502.
 *  - It returns `parsed_output: null` when there is NO text block to parse,
 *    most often a refusal. That path has the response, so branch on
 *    `stop_reason` here.
 *
 * The tool runner and the Batches API have no `parse()`: you validate the
 * text yourself, so every case lands here, and `stop_reason` tells them apart:
 *
 *  - `refusal`     The model declined; `stop_details` says why. Not an
 *                  upstream fault: 422.
 *  - `max_tokens`  Generation hit the ceiling mid-JSON. Thinking counts
 *                  against `max_tokens`, so this is a config problem: 502.
 *  - anything else The response ended normally and did not validate: 502.
 */
/**
 * Structural rather than `Anthropic.Message`, so the beta tool runner's
 * `BetaMessage` fits too.
 */
interface StoppedResponse {
  stop_reason: string | null;
  stop_details?: object | null;
}

export interface MissingOutput {
  status: 422 | 502;
  body: {
    error: "refused" | "truncated_output" | "unparseable_output";
    detail: string;
    stop_reason: string | null;
    stop_details?: object | null;
  };
}

export function explainMissingOutput(response: StoppedResponse): MissingOutput {
  const { stop_reason } = response;

  if (stop_reason === "refusal") {
    return {
      status: 422,
      body: {
        error: "refused",
        detail: "The model declined this request. See stop_details for the category.",
        stop_reason,
        stop_details: response.stop_details ?? null,
      },
    };
  }

  if (stop_reason === "max_tokens") {
    return {
      status: 502,
      body: {
        error: "truncated_output",
        detail: "Generation hit max_tokens before the JSON was complete.",
        stop_reason,
      },
    };
  }

  return {
    status: 502,
    body: {
      error: "unparseable_output",
      detail: "The model response did not validate against the schema.",
      stop_reason,
    },
  };
}
