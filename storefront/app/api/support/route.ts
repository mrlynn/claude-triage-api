import { NextResponse } from "next/server";
import { z } from "zod";
import { triage, MAX_MESSAGE_CHARS } from "@/lib/triage";
import { checkLimits, clientIp } from "@/lib/ratelimit";

/**
 * The one endpoint in this app that spends money.
 *
 * Order matters: validate shape, then check limits, then call the model.
 * Checking limits after the model call would be theatre.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  message: z.string().min(10).max(MAX_MESSAGE_CHARS),
  product: z.string().max(120).optional(),
  orderId: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        detail: `Tell us what happened in 10 to ${MAX_MESSAGE_CHARS} characters.`,
      },
      { status: 400 },
    );
  }

  const verdict = await checkLimits(clientIp(request.headers));
  if (!verdict.ok) {
    const detail =
      verdict.reason === "per_ip"
        ? "You have submitted a few of these already. Give it a few minutes."
        : verdict.reason === "daily_cap"
          ? "This demo has hit its daily cap. It resets at midnight UTC."
          : verdict.reason === "store_error"
            ? "We cannot verify the demo's spend limit right now, so live submissions are paused."
            : "The demo is not configured to accept live submissions right now.";
    return NextResponse.json(
      { error: verdict.reason, detail },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } },
    );
  }

  try {
    const { message, product, orderId } = parsed.data;
    const outcome = await triage(message, { product, orderId });
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("triage failed", err);
    return NextResponse.json(
      {
        error: "upstream_error",
        detail: "We could not classify that just now. Try again shortly.",
      },
      { status: 502 },
    );
  }
}
