import { NextResponse } from "next/server";
import { AiGateError, gateBody, guardAi, keyError, noteUsage, settle } from "@/lib/funding";
import { redactSecrets } from "@/lib/secrets";
import { buildSystem, callClaude, MAX_MESSAGE_CHARS } from "@/lib/triage";
import { wrapUntrusted, redactPII } from "@/lib/untrusted";
import { costMicros } from "@/lib/cost";
import { recordSpend } from "@/lib/telemetry";

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

  let funding;
  try {
    funding = await guardAi(request, "injection", "classify");
  } catch (error) {
    if (!(error instanceof AiGateError)) throw error;
    return NextResponse.json(gateBody(error), {
      status: error.status,
      headers: error.retryAfterSec ? { "Retry-After": String(error.retryAfterSec) } : undefined,
    });
  }

  // Redaction runs on the way IN. A visitor pasting a real card number into a
  // public demo is a foreseeable event, and the fix is for it never to reach
  // the model or the logs rather than for the reply to be tactful about it.
  const { text: safeMessage, redactions } = redactPII(message);

  try {
    const response = await callClaude(buildSystem({}), safeMessage, { defended, client: funding.client });
    // Before any early return: a refusal or an unparseable reply was still billed.
    const micros = costMicros(response.usage, response.model);
    noteUsage(funding, response);
    recordSpend("injection", micros);
    const meter = await settle(funding, micros);
    const triage = response.parsed_output;

    if (!triage) {
      if (response.stop_reason === "refusal") {
        return NextResponse.json(
          { error: "refused", detail: "The model declined this request.", ...(meter ? { meter } : {}) },
          { status: 422 },
        );
      }
      return NextResponse.json(
        { error: "unparseable_output", detail: "The model output did not validate.", ...(meter ? { meter } : {}) },
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
      ...(meter ? { meter } : {}),
    });
  } catch (err) {
    await settle(funding, 0, err);
    const refused = await keyError(funding, err);
    if (refused) return NextResponse.json(gateBody(refused), { status: refused.status });
    console.error("injection playground call failed", redactSecrets(err));
    return NextResponse.json(
      { error: "upstream_error", detail: "The classifier call failed." },
      { status: 502 },
    );
  }
}
