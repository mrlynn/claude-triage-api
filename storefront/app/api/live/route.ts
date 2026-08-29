import { checkLimits, clientIp } from "@/lib/ratelimit";
import { redactPII } from "@/lib/untrusted";
import { pricingFor } from "@/lib/pricing.generated";
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
 *     already been paid for up to the point of cancellation.
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

  const verdict = await checkLimits(clientIp(request.headers), "live");
  if (!verdict.ok) {
    return Response.json(
      {
        error: verdict.reason,
        detail:
          verdict.reason === "per_ip"
            ? "That is a lot of previews. The live pass pauses for a few minutes; the classifier below still works."
            : verdict.reason === "daily_cap"
              ? "This demo has hit its daily cap. It resets at midnight UTC."
              : "Live previews are paused right now.",
        retryAfterSec: verdict.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } },
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

      try {
        const run = streamLive(safeMessage, request.signal);

        // `sent` is what makes this an append-only stream: a field is emitted
        // once, when it first completes, and never re-emitted. The client can
        // therefore treat every `field` event as new information and does not
        // need to diff anything.
        let buffer = "";
        const sent = new Set<string>();
        let firstFieldMs: number | null = null;

        for await (const event of run) {
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
        const price = pricingFor(LIVE_MODEL);
        const u = final.usage;
        const cached = u.cache_read_input_tokens ?? 0;
        const written = u.cache_creation_input_tokens ?? 0;

        const costUsd =
          (u.input_tokens * price.inputPerMTok +
            written * price.inputPerMTok * price.cacheWriteMultiplier +
            cached * price.inputPerMTok * price.cacheReadMultiplier +
            u.output_tokens * price.outputPerMTok) /
          1_000_000;

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
        // An abort is the expected, healthy path here — it means the visitor
        // kept typing, which is the whole design. Logging it as an error would
        // fill the logs with successful debounces.
        if (request.signal.aborted || (err as Error)?.name === "AbortError") {
          emit("cancelled", { total_ms: Date.now() - t0 });
        } else {
          console.error("live preview failed", err);
          emit("failure", { detail: "The preview pass failed. Keep typing." });
        }
      } finally {
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
