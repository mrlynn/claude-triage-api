import { z } from "zod";
import { ASSISTANT_ORIGIN, cors, runtimeHeaders, sessionId } from "@/lib/assistant";
export const runtime = "nodejs";
const Body = z.object({ proposalId: z.string().uuid() });
export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  const id = sessionId(request);
  if (!body.success || !id) return cors(request, Response.json({ error: "invalid_request" }, { status: 400 }));
  const upstream = await fetch(`${ASSISTANT_ORIGIN}/v1/assistant/actions/${body.data.proposalId}/confirm`, { method: "POST", headers: runtimeHeaders(), body: JSON.stringify({ sessionId: id }) });
  return cors(request, new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json" } }));
}
