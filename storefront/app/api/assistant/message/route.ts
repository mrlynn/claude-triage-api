import { z } from "zod";
import { ASSISTANT_ORIGIN, cors, runtimeHeaders, sessionId } from "@/lib/assistant";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  message: z.string().trim().min(1).max(2_000),
  surface: z.enum(["storefront", "course"]),
  context: z.object({ path: z.string().max(300), title: z.string().max(200).optional(), product: z.string().max(120).optional(), orderId: z.string().max(40).optional(), progress: z.array(z.string().max(80)).max(20).default([]) }),
});

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204, headers: { "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } }));
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return cors(request, Response.json({ error: "invalid_request" }, { status: 400 }));
  const id = sessionId(request);
  if (!id) return cors(request, Response.json({ error: "session_required" }, { status: 401 }));
  try {
    const upstream = await fetch(`${ASSISTANT_ORIGIN}/v1/assistant/messages`, { method: "POST", headers: runtimeHeaders(), body: JSON.stringify({ ...parsed.data, sessionId: id }) });
    return cors(request, new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } }));
  } catch {
    return cors(request, Response.json({ error: "assistant_unavailable", detail: "Ask Northwind is temporarily unavailable." }, { status: 503 }));
  }
}
