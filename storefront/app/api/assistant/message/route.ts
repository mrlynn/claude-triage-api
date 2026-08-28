import { z } from "zod";
import { cors, sessionId } from "@/lib/assistant";
import { runAssistant } from "@/lib/assistantAgent";
import { checkLimits, clientIp } from "@/lib/ratelimit";

/**
 * One exchange with Ask Northwind, streamed.
 *
 * This route used to be a facade that forwarded to a container running the
 * Agent SDK. The loop lives in this process now — see the header of
 * `lib/assistantAgent.ts` for why — so the request never leaves Vercel, and
 * the Anthropic key never leaves the server.
 *
 * X-Accel-Buffering matters, and it is Lab 4 Step 4: without it a proxy
 * buffers the whole stream and delivers it in one chunk, which turns a live
 * answer into a long pause followed by a wall of text.
 */
export const runtime = "nodejs";

/**
 * Six turns of tool use is longer than a single classification. The facade
 * version allowed 30s because it was only proxying; this one is doing the
 * work, and a loop cut off mid-answer is worse than a slow one.
 */
export const maxDuration = 60;

const Body = z.object({
  message: z.string().trim().min(1).max(2_000),
  surface: z.enum(["storefront", "course"]),
  context: z.object({
    path: z.string().max(300),
    title: z.string().max(200).optional(),
    product: z.string().max(120).optional(),
    orderId: z.string().max(40).optional(),
    progress: z.array(z.string().max(80)).max(20).default([]),
  }),
});

export async function OPTIONS(request: Request) {
  return cors(
    request,
    new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    }),
  );
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return cors(request, Response.json({ error: "invalid_request" }, { status: 400 }));

  const id = sessionId(request);
  if (!id) return cors(request, Response.json({ error: "session_required" }, { status: 401 }));

  // The support form has been rate limited since it existed; this route was
  // not, which made the chat box the cheapest way to spend the project's key.
  // One conversation is up to six model calls, so it gets its own window
  // rather than sharing the form's — neither surface should be able to
  // exhaust the other.
  const verdict = await checkLimits(clientIp(request.headers), "assistant");
  if (!verdict.ok) {
    // "unconfigured" means no database, so no counter, so no spend ceiling —
    // the limiter fails closed in production by design. Reporting that as
    // "you are going too fast" would send someone to wait out a minute for a
    // deployment problem that a minute does not fix.
    const unconfigured = verdict.reason === "unconfigured";
    return cors(
      request,
      Response.json(
        {
          error: unconfigured ? "unconfigured" : "rate_limited",
          detail: unconfigured
            ? "Ask Northwind is not configured on this deployment."
            : "Ask Northwind is busy from your connection. Try again in a minute.",
        },
        {
          status: unconfigured ? 503 : 429,
          headers: unconfigured ? {} : { "Retry-After": String(verdict.retryAfterSec) },
        },
      ),
    );
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runAssistant({ sessionId: id, ...parsed.data })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (error) {
        // `runAssistant` already converts its own failures into an error event.
        // This is the belt for anything that escapes it, because a stream that
        // closes silently renders as a client still waiting.
        console.error("assistant stream crashed", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", detail: "The assistant could not complete that request." })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return cors(
    request,
    new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    }),
  );
}
