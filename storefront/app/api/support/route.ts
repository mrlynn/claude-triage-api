import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import { clientIp } from "@/lib/ratelimit";

/**
 * Plain JSON endpoint. Drains the same generator the streaming route uses and
 * returns only the final result, so curl and the narrated UI can never drift
 * apart in behaviour.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);

  for await (const event of runPipeline(raw, clientIp(request.headers))) {
    if (event.type === "failure") {
      return NextResponse.json(
        { error: event.error, detail: event.detail },
        { status: event.status },
      );
    }
    if (event.type === "result") {
      return NextResponse.json({
        triage: event.triage,
        cost_usd: event.cost_usd,
        cache_hit: event.cache_hit,
        latency_ms: event.latency_ms,
        total_ms: event.total_ms,
      });
    }
  }

  return NextResponse.json(
    { error: "internal_error", detail: "The pipeline produced no result." },
    { status: 500 },
  );
}
