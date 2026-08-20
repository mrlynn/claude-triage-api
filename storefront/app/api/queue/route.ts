import { NextResponse } from "next/server";
import { listEscalations, queueStats } from "@/lib/models";
import { checkQueueAccess } from "@/lib/queueAuth";
import { HAS_MONGO } from "@/lib/mongo";
import { DEMO_QUEUE, demoStats } from "@/lib/demoQueue";

/**
 * The reviewer queue, read side.
 *
 * TWO MODES, and the split is the point.
 *
 * Without a token you get the DEMO board: seven fictional escalations from
 * the course's own inbound queue, classified by this same route, about
 * nobody. With a token you get the real persisted submissions.
 *
 * The earlier version gated both, which conflated two different things. The
 * board — the states, the escalation reasons, the redaction counts, the fact
 * that `requires_human` routes somewhere at all — is the teaching artifact,
 * and it needs representative tickets rather than real ones. What actually
 * needs guarding is messages typed by members of the public into a URL that
 * ends up in slide decks. Gating the first to protect the second produced a
 * page that taught nothing to anyone without a credential.
 *
 * Returns the board and its summary stats in one call, because the two are
 * always rendered together and a second round trip would exist only to
 * satisfy a REST aesthetic.
 */
export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request: Request) {
  const auth = await checkQueueAccess(request);

  // No token, or no database: serve the demo board. Not an error state — it
  // is the default experience, and the one most people will ever see.
  if (!auth.ok || !HAS_MONGO) {
    return NextResponse.json({
      mode: "demo",
      items: DEMO_QUEUE,
      stats: demoStats(),
      note:
        "Fictional tickets from the course's inbound queue, classified by this " +
        "same route. Real submissions from the support form are held behind " +
        "QUEUE_TOKEN, and reviewer actions are read-only here.",
    });
  }

  const [items, stats] = await Promise.all([listEscalations(), queueStats()]);
  return NextResponse.json({ mode: "live", items, stats });
}
