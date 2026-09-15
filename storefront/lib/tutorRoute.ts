import "server-only";
import type { z } from "zod";
import { cors } from "./assistant";
import { checkLimits, clientIp } from "./ratelimit";
import { TutorError } from "./tutor";

/**
 * The part the three Tutor routes share: CORS, body validation, the rate limit,
 * and turning a failure into a status the page can explain.
 *
 * No session cookie is required, unlike Ask Northwind. The assistant keys a
 * stored conversation to the cookie; the Tutor stores nothing, so there is
 * nothing to key. The per-IP window and the global daily cap still apply —
 * they protect the bill, and the bill does not care whether anything was saved.
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

export async function tutorPost<S extends z.ZodType>(
  request: Request,
  body: S,
  run: (input: z.infer<S>) => Promise<unknown>,
): Promise<Response> {
  const reply = (data: unknown, init?: ResponseInit) => cors(request, Response.json(data, init));

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "invalid_request" }, { status: 400 });

  const verdict = await checkLimits(clientIp(request.headers), "tutor");
  if (!verdict.ok) {
    const unconfigured = verdict.reason === "unconfigured";
    return reply(
      {
        error: unconfigured ? "unconfigured" : "rate_limited",
        detail: unconfigured
          ? "The Tutor is not configured on this deployment."
          : "The Tutor is busy from your connection. Try again in a minute.",
      },
      {
        status: unconfigured ? 503 : 429,
        headers: unconfigured ? {} : { "Retry-After": String(verdict.retryAfterSec) },
      },
    );
  }

  try {
    return reply(await run(parsed.data));
  } catch (error) {
    if (error instanceof TutorError) return reply({ error: "tutor_failed", detail: error.message }, { status: 502 });
    console.error("tutor call failed", error);
    return reply({ error: "tutor_failed", detail: "The tutor could not complete that request." }, { status: 502 });
  }
}
