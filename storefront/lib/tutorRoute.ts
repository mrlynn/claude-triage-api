import "server-only";
import type { z } from "zod";
import { cors } from "./assistant";
import type { Surface } from "./cost";
import { AiGateError, gateBody, gateResponse, guardAi, keyError, noteUsage, reserveMore, settle } from "./funding";
import { redactSecrets } from "./secrets";
import { TutorError, type CallOptions } from "./tutor";

/**
 * The part the four Tutor routes share: CORS, body validation, who pays, and
 * turning a failure into a status the page can explain.
 *
 * No assistant cookie is required, unlike Ask Northwind: the Tutor stores no
 * conversation, so there is nothing to key. (It does log call metadata and
 * review outcomes for the admin console — `activity.ts` — against the
 * sign-in session, never against this.) What it does need, once credit is
 * enforced, is to know who is paying — `guardAi` reads the sign-in session,
 * which is why the page now sends credentials. The per-IP window still applies
 * to everyone; it protects the service, not just the bill.
 */

export function tutorOptions(request: Request): Response {
  return cors(
    request,
    new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    }),
  );
}

export async function tutorPost<S extends z.ZodType, R extends object>(
  request: Request,
  body: S,
  surface: Surface,
  run: (input: z.infer<S>, options: CallOptions) => Promise<R>,
  /** Told the result and who paid, after a successful call. The review route logs outcomes with it. */
  after?: (input: z.infer<S>, result: R, userId: string | null) => void,
): Promise<Response> {
  const reply = (data: unknown, init?: ResponseInit) => cors(request, Response.json(data, init));

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "invalid_request" }, { status: 400 });

  let funding;
  try {
    funding = await guardAi(request, "tutor", surface);
  } catch (error) {
    if (error instanceof AiGateError) return gateResponse(request, error);
    throw error;
  }

  // Validation can throw after the model was paid, so cost is reported by
  // callback the moment a response arrives rather than read off the result.
  let spent = 0;
  const onSpend: CallOptions["onSpend"] = (micros, response) => {
    spent += micros;
    noteUsage(funding, response);
  };

  try {
    const result = await run(parsed.data, { client: funding.client, onSpend, reserveRetry: () => reserveMore(funding) });
    const meter = await settle(funding, spent);
    after?.(parsed.data, result, funding.kind === "house" ? null : funding.userId);
    return reply({ ...result, ...(meter ? { meter } : {}) });
  } catch (error) {
    const meter = await settle(funding, spent, error);
    const refused = await keyError(funding, error);
    if (refused) return reply({ ...gateBody(refused), ...(meter ? { meter } : {}) }, { status: refused.status });
    if (error instanceof TutorError) {
      return reply({ error: "tutor_failed", detail: error.message, ...(meter ? { meter } : {}) }, { status: 502 });
    }
    console.error("tutor call failed", redactSecrets(error));
    return reply(
      { error: "tutor_failed", detail: "The tutor could not complete that request.", ...(meter ? { meter } : {}) },
      { status: 502 },
    );
  }
}
