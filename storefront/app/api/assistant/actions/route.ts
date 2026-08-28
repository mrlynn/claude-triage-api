import { z } from "zod";
import { cors, sessionId } from "@/lib/assistant";
import { confirmProposal } from "@/lib/assistantAgent";
import { clientIp } from "@/lib/ratelimit";

/**
 * Confirming a proposed support action, which files the ticket.
 *
 * A SEPARATE REQUEST, deliberately. The model proposes; a person confirms; and
 * only this route writes. It re-derives policy authority first, because a
 * stored proposal is not evidence that it was ever within policy — that is
 * what makes the confirmation meaningful when the model was mistaken or was
 * talked into something fifteen minutes ago.
 *
 * Note what is NOT here: a tool the agent can call to open a ticket. Giving it
 * one would move the write back onto the model's say-so, which is the whole
 * thing this design is arranged to prevent.
 */
export const runtime = "nodejs";

const Body = z.object({ proposalId: z.string().uuid() });

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
  const body = Body.safeParse(await request.json().catch(() => null));
  const id = sessionId(request);
  if (!body.success || !id) return cors(request, Response.json({ error: "invalid_request" }, { status: 400 }));

  const result = await confirmProposal(id, body.data.proposalId, clientIp(request.headers));
  if (result.ok) {
    return cors(request, Response.json({ status: "recorded", action: result.action, ticket: result.ticketId }));
  }

  // Distinct statuses, because these are different problems: a replayed or
  // expired proposal is the system working, and an out-of-policy one is not.
  const status =
    result.reason === "unavailable" ? 503 : result.reason === "rate_limited" ? 429 : result.reason === "outside_authority" ? 409 : 404;
  return cors(request, Response.json({ error: result.reason }, { status }));
}
