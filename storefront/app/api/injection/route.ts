import { NextResponse } from "next/server";
import { checkLimits, clientIp } from "@/lib/ratelimit";
import { buildSystem, callClaude, MAX_MESSAGE_CHARS } from "@/lib/triage";
import { wrapUntrusted, redactPII } from "@/lib/untrusted";

/**
 * The injection playground's endpoint.
 *
 * Runs one message through triage twice-over conceptually: it returns what the
 * model was actually shown (the wrapped, escaped block) alongside the
 * classification, so a visitor can see the defence rather than be told about
 * it. With `defended: false` it reproduces the pre-Lab-8 behaviour — raw
 * interpolation into the delimiters — which is the only honest way to
 * demonstrate that the fix does something.
 *
 * Its rate-limit scope is "injection", separate from "support". Someone
 * working through payloads here must not burn the allowance for filing an
 * actual support ticket, which is the one thing on this site that has to work.
 * They still share the global daily cap, because the bill does not care which
 * page spent it.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    defended?: unknown;
  } | null;

  const message = typeof body?.message === "string" ? body.message : "";
  const defended = body?.defended !== false;

  if (message.trim().length < 10 || message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      {
        error: "invalid_request",
        detail: `Message must be 10 to ${MAX_MESSAGE_CHARS} characters.`,
      },
      { status: 400 },
    );
  }

  const verdict = await checkLimits(clientIp(request.headers), "injection");
  if (!verdict.ok) {
    return NextResponse.json(
      {
        error: verdict.reason,
        detail:
          verdict.reason === "per_ip"
            ? "You have run a few of these already. Give it a few minutes."
            : verdict.reason === "daily_cap"
              ? "This demo has hit its daily cap. It resets at midnight UTC."
              : "Live runs are paused right now.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(verdict.retryAfterSec) },
      },
    );
  }

  // Redaction runs on the way IN. A visitor pasting a real card number into a
  // public demo is a foreseeable event, and the fix is for it never to reach
  // the model or the logs rather than for the reply to be tactful about it.
  const { text: safeMessage, redactions } = redactPII(message);

  try {
    const response = await callClaude(buildSystem({}), safeMessage, { defended });
    const triage = response.parsed_output;

    if (!triage) {
      return NextResponse.json(
        { error: "unparseable_output", detail: "The model output did not validate." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      defended,
      // What the model literally received, so the escaping is visible rather
      // than asserted.
      shown_to_model: defended
        ? wrapUntrusted(safeMessage)
        : `<customer_message>\n${safeMessage}\n</customer_message>`,
      redactions: redactions.length,
      triage,
      model: response.model,
    });
  } catch (err) {
    console.error("injection playground call failed", err);
    return NextResponse.json(
      { error: "upstream_error", detail: "The classifier call failed." },
      { status: 502 },
    );
  }
}
