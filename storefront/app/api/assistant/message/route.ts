import { z } from "zod";
import { cors, sessionId } from "@/lib/assistant";
import { runAssistant } from "@/lib/assistantAgent";
import { ASSISTANT_LIMITS } from "@/lib/callLimits";
import { AiGateError, gateResponse, guardAi, keyError, noteUsage, settle } from "@/lib/funding";

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

// The same numbers cost.ts prices a worst-case run from.
const Body = z.object({
  message: z.string().trim().min(1).max(ASSISTANT_LIMITS.messageChars),
  surface: z.enum(["storefront", "course"]),
  context: z.object({
    path: z.string().max(ASSISTANT_LIMITS.pathChars),
    title: z.string().max(ASSISTANT_LIMITS.titleChars).optional(),
    product: z.string().max(ASSISTANT_LIMITS.productChars).optional(),
    orderId: z.string().max(ASSISTANT_LIMITS.orderIdChars).optional(),
    progress: z
      .array(z.string().max(ASSISTANT_LIMITS.progressItemChars))
      .max(ASSISTANT_LIMITS.progressItems)
      .default([]),
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
  // exhaust the other. `guardAi` applies that window, then decides who pays.
  let funding;
  try {
    funding = await guardAi(request, "assistant", "assistant_turn");
  } catch (error) {
    if (!(error instanceof AiGateError)) throw error;
    return gateResponse(request, error);
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let spent = 0;
      // The error event's code, if the run ended in one. `runAssistant` turns its own failures into events.
      let failure: string | undefined;
      try {
        const run = runAssistant({
          sessionId: id,
          ...parsed.data,
          client: funding.client,
          onSpend: (micros, { requests, ...response }) => {
            spent = micros;
            noteUsage(funding, response, requests);
          },
          onError: async (error) => {
            const refused = await keyError(funding, error);
            return refused ? { detail: refused.detail, code: refused.code } : null;
          },
        });
        for await (const event of run) {
          if (event.type === "error") failure = event.code ?? "error";
          // Settle before `done`, so the meter lands while the page is still listening.
          if (event.type === "done") {
            const meter = await settle(funding, spent);
            if (meter) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meter", meter })}\n\n`));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        // A run that ended in an error never yields `done`.
        const meter = await settle(funding, spent, failure);
        if (meter) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meter", meter })}\n\n`));
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
        // Idempotent: a no-op when the loop above already settled. Here for the
        // crash path, which would otherwise leave the whole reservation taken.
        await settle(funding, spent, failure ?? "crashed");
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
