import Anthropic from "@anthropic-ai/sdk";
import { VERSION } from "@anthropic-ai/sdk/version";
import { AiGateError, gateBody, guardAi, keyError, noteUsage, settle, type Meter } from "@/lib/funding";
import { redactSecrets } from "@/lib/secrets";
import { costMicros, microsToUsd } from "@/lib/cost";
import { recordSpend } from "@/lib/telemetry";
import { parseExplorerBody } from "@/lib/explorerPolicy";
import { billedUsage, fold, type Envelope } from "@/lib/explorerWire";

/**
 * The Messages API explorer's one call.
 *
 * Every other AI route on this site hides the API: it builds a request, reads the answer and returns something shaped
 * for its page. This one does the opposite. It sends the body the visitor built, unchanged, and reports four things
 * as they happen:
 *
 *   - `attempt`: the request the SDK actually put on the wire, captured by wrapping `fetch`. URL, every header (keys
 *     redacted) and the exact body bytes. A retry is a second `attempt`, which is how you see one.
 *   - `headers`: status and response headers, the moment they arrive. The gap before this is everything Anthropic
 *     does before generating: authentication, validation, rate limiting, queueing, and reading the prompt.
 *   - `wire`: each network read, verbatim. `asResponse()` hands back the raw body instead of the SDK's event iterator,
 *     which drops `ping` frames and hides chunk boundaries. `lib/explorerWire.ts` parses it, here and in the browser.
 *   - `api_error`: a 4xx or 5xx body, verbatim. A 400 is the most precise documentation of a rule there is.
 *
 * Funding, cancellation and billing work as in `/api/live`: the gate runs before the stream opens, `request.signal`
 * reaches the API, and a stream cut off halfway is billed for the usage it reported.
 *
 * Nothing the visitor wrote is stored. `settle` logs a call's cost and outcome to `ai_calls`, not its content.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** Keys never leave the server, including the last four characters of the house key. */
function redactHeaders(headers: Headers, funding: string): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name] =
      name === "x-api-key" || name === "authorization"
        ? `${value.slice(0, 7)}…•••• (${funding === "byok" ? "your key" : "Northwind's key"})`
        : value;
  });
  return out;
}

/**
 * Response headers are shown as received, less the ones that identify the account behind the house key. The rate-limit
 * headers stay: how much of the organisation's limit is left is exactly what a developer should learn to read.
 */
const HIDDEN_RESPONSE_HEADERS = new Set(["anthropic-organization-id", "anthropic-workspace-id", "set-cookie"]);

function responseHeaders(headers: Headers | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  headers?.forEach((value, name) => {
    if (!HIDDEN_RESPONSE_HEADERS.has(name)) out[name] = value;
  });
  return out;
}

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = parseExplorerBody(raw);
  if (!parsed.ok) {
    return Response.json({ error: "invalid_request", detail: parsed.detail }, { status: 400 });
  }

  let funding;
  try {
    funding = await guardAi(request, "explorer", "explorer");
  } catch (error) {
    if (!(error instanceof AiGateError)) throw error;
    return Response.json(gateBody(error), {
      status: error.status,
      headers: error.retryAfterSec ? { "Retry-After": String(error.retryAfterSec) } : undefined,
    });
  }

  const encoder = new TextEncoder();
  const t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Kept for billing: the route folds its own wire events to find the usage, exactly as the page does.
      const seen: Envelope[] = [];
      const emit = (e: Envelope) => {
        if (e.event === "wire" || e.event === "headers") seen.push(e);
        controller.enqueue(encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      };

      emit({ event: "start", data: { t: 0, funding: funding.kind, sdk: VERSION } });

      let attempts = 0;
      let failure: unknown;
      let recorded = false;
      const record = async (): Promise<Meter | null> => {
        if (recorded) return null;
        recorded = true;
        const billed = billedUsage(fold(seen));
        if (!billed) return settle(funding, 0, failure);
        const micros = costMicros(billed.usage, billed.model);
        noteUsage(funding, { usage: billed.usage, model: billed.model });
        recordSpend("explorer", micros);
        return settle(funding, micros, failure);
      };

      const client = funding.client.withOptions({
        // One retry, so a retried 529 is visible as a second attempt without tripling the wait.
        maxRetries: 1,
        fetch: async (url: string | URL | Request, init?: RequestInit) => {
          const body = typeof init?.body === "string" ? init.body : null;
          emit({
            event: "attempt",
            data: {
              t: now(),
              n: ++attempts,
              method: init?.method ?? "GET",
              url: String(url),
              headers: redactHeaders(new Headers(init?.headers), funding.kind),
              body,
            },
          });
          return fetch(url, init);
        },
      });

      try {
        // The parsed body, not the raw one: the schema is strict, so nothing is dropped, and every key this object
        // has was checked against the cost ceiling. The cast is because it may be invalid on purpose.
        const response = await client.messages
          .create(parsed.body as unknown as Anthropic.MessageCreateParamsNonStreaming, { signal: request.signal })
          .asResponse();

        emit({
          event: "headers",
          data: { t: now(), status: response.status, headers: responseHeaders(response.headers) },
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk) emit({ event: "wire", data: { t: now(), chunk } });
          }
        }

        const state = fold(seen);
        const billed = billedUsage(state);
        const meter = await record();
        if (meter) emit({ event: "meter", data: meter });
        emit({
          event: "done",
          data: {
            t: now(),
            model: billed?.model ?? parsed.body.model,
            cost_usd: billed ? microsToUsd(costMicros(billed.usage, billed.model)) : 0,
          },
        });
      } catch (err) {
        failure = request.signal.aborted ? "aborted" : err;
        if (request.signal.aborted || err instanceof Anthropic.APIUserAbortError) {
          emit({ event: "cancelled", data: { t: now() } });
        } else if (err instanceof Anthropic.APIError && err.status !== undefined) {
          emit({
            event: "headers",
            data: { t: now(), status: err.status, headers: responseHeaders(err.headers) },
          });
          emit({ event: "api_error", data: { t: now(), status: err.status, body: err.error ?? null } });
          // A 401 or 429 on a learner's own key is a funding event as well as an API error: the meter has to hear it.
          const refused = await keyError(funding, err);
          if (refused) emit({ event: "failure", data: { t: now(), ...gateBody(refused) } });
        } else {
          console.error("explorer call failed", redactSecrets(err));
          emit({ event: "failure", data: { t: now(), detail: "The call failed before the API answered." } });
        }
      } finally {
        try {
          await record();
        } catch (err) {
          console.error("explorer accounting failed (ignored)", redactSecrets(err));
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
