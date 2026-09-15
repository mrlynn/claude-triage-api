/**
 * Why `parsed_output` is null, stated as an HTTP response.
 *
 * TEACHING NOTE: `messages.parse()` gives you `parsed_output: null` for several
 * different reasons, and they are not the same failure. Reporting all of them
 * as "unparseable" is how a refusal ends up in a dashboard as a schema bug.
 *
 *  - `refusal`     The model declined. The output may not match the schema,
 *                  and `stop_details` says why. Not an upstream fault: 422.
 *  - `max_tokens`  Generation hit the ceiling mid-JSON. Thinking counts
 *                  against `max_tokens`, so this is a config problem: 502.
 *  - anything else The response ended normally and still did not validate
 *                  (for example a `.min()`/`.max()` bound the SDK checks
 *                  client-side, because the API does not enforce them): 502.
 *
 * Branch on `stop_reason` first. It is on every response and costs nothing.
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
