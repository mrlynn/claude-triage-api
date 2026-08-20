import { NextResponse } from "next/server";
import { listEscalations, queueStats } from "@/lib/models";
import { checkQueueAccess } from "@/lib/queueAuth";
import { HAS_MONGO } from "@/lib/mongo";

/**
 * The reviewer queue, read side.
 *
 * Returns the board and its summary stats in one call, because the two are
 * always rendered together and a second round trip would exist only to satisfy
 * a REST aesthetic.
 */
export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request: Request) {
  const auth = await checkQueueAccess(request);
  if (!auth.ok) {
    return NextResponse.json(
      {
        error: auth.reason,
        detail:
          auth.reason === "unconfigured"
            ? "QUEUE_TOKEN is not set, so the reviewer queue is disabled. A missing secret means closed, never open."
            : "A valid queue token is required.",
      },
      { status: auth.reason === "unconfigured" ? 503 : 401 },
    );
  }

  if (!HAS_MONGO) {
    return NextResponse.json(
      { error: "unconfigured", detail: "No database is configured." },
      { status: 503 },
    );
  }

  const [items, stats] = await Promise.all([listEscalations(), queueStats()]);
  return NextResponse.json({ items, stats });
}
