import { runPipeline } from "@/lib/pipeline";
import { clientIp } from "@/lib/ratelimit";

/**
 * The narrated version. Same pipeline, emitted stage by stage over SSE so the
 * browser can show what the request is actually doing while it does it.
 *
 * X-Accel-Buffering matters: without it a proxy will buffer the whole stream
 * and deliver it in one chunk, which turns a live pipeline into a slideshow
 * that arrives after the answer. That is Lab 4, Step 4.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const ip = clientIp(request.headers);
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runPipeline(raw, ip)) {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
          );
        }
      } catch (err) {
        console.error("pipeline crashed", err);
        controller.enqueue(
          encoder.encode(
            `event: failure\ndata: ${JSON.stringify({
              type: "failure",
              id: "model",
              status: 500,
              error: "internal_error",
              detail: "Something broke mid-request.",
            })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
