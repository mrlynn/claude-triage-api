import { AiGateError, gateBody, guardAi, keyError, noteUsage, settle, type Meter } from "@/lib/funding";
import { redactSecrets } from "@/lib/secrets";
import { redactPII } from "@/lib/untrusted";
import { costMicros, microsToUsd, type UsageLike } from "@/lib/cost";
import { recordSpend } from "@/lib/telemetry";
import {
  LIVE_MODEL,
  MAX_MESSAGE_CHARS,
  MIN_LIVE_CHARS,
  completedFields,
  streamLive,
  type LiveResult,
} from "@/lib/live";

/**
 * The as-you-type preview endpoint.
 *
 * SSE rather than JSON, for one reason that is worth being precise about: the
 * point of this surface is that you can see the model deciding. A JSON
 * response would show a spinner and then five answers at once, which looks
 * exactly like a slow form. Streaming the fields out as they complete turns
 * the same call into something you can watch narrow down — category lands
 * first, confidence last, and the gap between them is real latency rather
 * than a staged animation.
 *
 * WHAT CANCELS WHAT. Three separate mechanisms, because they fail differently:
 *
 *   - The BROWSER aborts its `fetch` when you type again. That stops the
 *     rendering of a stale answer immediately.
 *   - `request.signal` carries that abort through to the Anthropic SDK, so the
 *     upstream call is torn down too. Without this line the connection closes
 *     and the model keeps generating on our bill, which is the failure mode
 *     that makes naive as-you-type demos expensive.
 *   - The rate limiter still counts the attempt. A cancelled request has
 *     already been paid for up to the point of cancellation, so its spend is
 *     recorded from the usage the stream reported before it was torn down.
 *
 * `X-Accel-Buffering: no` for the same reason `/api/support/stream` needs it:
 * a buffering proxy delivers the whole stream in one chunk and the live part
 * of "live" disappears.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

type Emit = (event: string, data: unknown) => void;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message : "";

  if (message.trim().length < MIN_LIVE_CHARS || message.length > MAX_MESSAGE_CHARS) {
    return Response.json(
      {
        error: "invalid_request",
        detail: `Message must be ${MIN_LIVE_CHARS} to ${MAX_MESSAGE_CHARS} characters.`,
      },
      { status: 400 },
    );
  }

  // Before the stream opens, so a refusal is a real HTTP status rather than an
  // event inside a 200 the page has already started rendering.
  let funding;
  try {
    funding = await guardAi(request, "live", "live");
  } catch (error) {
    if (!(error instanceof AiGateError)) throw error;
    return Response.json(
      {
        ...gateBody(error),
        detail:
          error.code === "rate_limited"
            ? "That is a lot of previews. The live pass pauses for a few minutes; the classifier below still works."
            : error.detail,
      },
      { status: error.status, headers: error.retryAfterSec ? { "Retry-After": String(error.retryAfterSec) } : undefined },
    );
  }

  // Redaction runs on the way IN, exactly as on the submitted path. A draft is
  // not less sensitive than a sent message — if anything it is more so, since
  // the customer has not decided yet whether to send it at all.
  const { text: safeMessage, redactions } = redactPII(message);

  const encoder = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (event, data) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      emit("start", { model: LIVE_MODEL, redactions: redactions.length });

      // What the stream has billed so far. `message_start` carries the input
      // side and each `message_delta` the running output count, so a preview
      // cancelled mid-flight can still be accounted for.
      let billed: UsageLike | null = null;
      let billedModel = LIVE_MODEL;
      let recorded = false;
      // What ended the stream early, if anything: an abort or an upstream error.
      let failure: unknown;
      const record = async (usage: UsageLike, model: string): Promise<{ micros: number; meter: Meter | null }> => {
        if (recorded) return { micros: 0, meter: null };
        recorded = true;
        const micros = costMicros(usage, model);
        noteUsage(funding, { usage, model });
        recordSpend("live", micros);
        return { micros, meter: await settle(funding, micros, failure) };
      };

      try {
        const run = streamLive(safeMessage, request.signal, funding.client);

        // `sent` is what makes this an append-only stream: a field is emitted
        // once, when it first completes, and never re-emitted. The client can
        // therefore treat every `field` event as new information and does not
        // need to diff anything.
        let buffer = "";
        const sent = new Set<string>();
        let firstFieldMs: number | null = null;

        for await (const event of run) {
          if (event.type === "message_start") {
            billed = { ...event.message.usage };
            billedModel = event.message.model;
          } else if (event.type === "message_delta" && billed) {
            billed.output_tokens = event.usage.output_tokens;
          }
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            buffer += event.delta.text;
            const done = completedFields(buffer);
            for (const [name, value] of Object.entries(done)) {
              if (sent.has(name)) continue;
              sent.add(name);
              firstFieldMs ??= Date.now() - t0;
              emit("field", { name, value, ms: Date.now() - t0 });
            }
          }
        }

        const final = await run.finalMessage();
        const u = final.usage;
        const cached = u.cache_read_input_tokens ?? 0;
        const { micros, meter } = await record(u, final.model);
        const costUsd = microsToUsd(micros);
        if (meter) emit("meter", meter);

        emit("done", {
          // The full object, so a client that missed a delta still converges.
          result: completedFields(buffer) as LiveResult,
          model: final.model,
          cost_usd: costUsd,
          cache_hit: cached > 0,
          cached_tokens: cached,
          input_tokens: u.input_tokens,
          output_tokens: u.output_tokens,
          first_field_ms: firstFieldMs,
          total_ms: Date.now() - t0,
        });
      } catch (err) {
        failure = request.signal.aborted ? "aborted" : err;
        // An abort is the expected, healthy path here — it means the visitor
        // kept typing, which is the whole design. Logging it as an error would
        // fill the logs with successful debounces.
        if (request.signal.aborted || (err as Error)?.name === "AbortError") {
          emit("cancelled", { total_ms: Date.now() - t0 });
        } else {
          const refused = await keyError(funding, err);
          if (refused) emit("failure", gateBody(refused));
          else {
            console.error("live preview failed", redactSecrets(err));
            emit("failure", { detail: "The preview pass failed. Keep typing." });
          }
        }
      } finally {
        // Cancelled or failed after the model started: it still cost something.
        // Telemetry must not be what leaves the stream unclosed.
        try {
          if (billed) await record(billed, billedModel);
          // Never reached the model at all: give the whole reservation back.
          else await settle(funding, 0, failure);
        } catch (err) {
          console.error("live preview accounting failed (ignored)", redactSecrets(err));
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
