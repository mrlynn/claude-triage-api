import { cors } from "@/lib/assistant";
import { amendFeedback, createFeedback } from "@/lib/feedback";
import { FeedbackBody, feedbackLabs, scrubComment } from "@/lib/feedbackPolicy";
import { lookupSession } from "@/lib/identity";
import { HAS_MONGO } from "@/lib/mongo";
import { checkLimits, clientIp } from "@/lib/ratelimit";
import { redactSecrets } from "@/lib/secrets";
import { CORPUS_INDEX } from "@/lib/tutor";
import { redactPII } from "@/lib/untrusted";

/**
 * Feedback from the course and the storefront: a rating, reasons, an optional
 * comment. Anyone may send it; a signed-in learner's is attributed, so the
 * owner can read it next to what that learner actually did.
 *
 * Nothing here calls a model, so there is no funding gate — only a per-IP
 * window. A comment is scrubbed twice before storage: `redactPII` for card
 * numbers and SSNs, `scrubComment` for emails, phone numbers and API keys.
 */
export const runtime = "nodejs";

export function OPTIONS(request: Request): Response {
  return cors(
    request,
    new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  const reply = (data: unknown, init?: ResponseInit) => cors(request, Response.json(data, init));

  const parsed = FeedbackBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "invalid_request" }, { status: 400 });
  if (!HAS_MONGO) return reply({ error: "unavailable", detail: "Feedback is not configured here." }, { status: 503 });

  const verdict = await checkLimits(clientIp(request.headers), "feedback");
  if (!verdict.ok) {
    return reply(
      { error: "rate_limited", detail: "That is a lot of feedback. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } },
    );
  }

  const { id, ...input } = parsed.data;
  const cleaned = {
    ...input,
    comment: scrubComment(input.comment === null ? null : redactPII(input.comment).text),
    labIds: feedbackLabs(input, CORPUS_INDEX),
  };

  try {
    if (id) {
      const ok = await amendFeedback(id, cleaned);
      return ok ? reply({ id }) : reply({ error: "not_amendable" }, { status: 409 });
    }
    // Attribution is best-effort: feedback from a visitor whose session cannot
    // be read is still worth keeping, just without a name on it.
    const session = await lookupSession(request).catch(() => null);
    return reply({ id: await createFeedback(cleaned, session?.userId ?? null) }, { status: 201 });
  } catch (error) {
    console.error("feedback write failed", redactSecrets(error));
    return reply({ error: "store_error", detail: "We could not save that. Try again shortly." }, { status: 503 });
  }
}
