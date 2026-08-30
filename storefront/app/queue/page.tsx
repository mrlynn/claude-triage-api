import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasQueueCookie } from "@/lib/queueAuth";
import QueueBoard from "./QueueBoard";

export const metadata: Metadata = {
  title: "Escalation queue — Northwind Outfitters",
  description: "Tickets the classifier flagged for a human.",
};

/**
 * Public and read-only by default; the token unlocks the real submissions and
 * the reviewer actions.
 *
 * Server component so it can exchange ?token= for a cookie. The board itself
 * is a client component; this file decides which framing it gets.
 */
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Hand the token to the route handler that can actually set a cookie.
  // Pages cannot: cookies are only modifiable in a Route Handler or Server
  // Action, which is a sensible restriction given a GET that mutates state on
  // the way to rendering is precisely what makes prefetching dangerous.
  if (token) {
    redirect(`/api/queue/session?token=${encodeURIComponent(token)}`);
  }

  const live = await hasQueueCookie();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/50">
          Internal · Escalations
        </p>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-pine sm:text-3xl">
          Escalation queue
        </h1>
        <p className="max-w-2xl text-sm text-pine/75">
          Every ticket here was classified <code>requires_human: true</code> and
          written by the <code>persist</code> stage. Tickets that did not need a
          human were classified and discarded — storage is a consequence of
          escalation, not of submission.
        </p>

        {live ? (
          <p className="max-w-2xl rounded-lg border border-ember/30 bg-ember/5 p-4 text-sm text-pine/75">
            <strong className="text-pine">
              Live queue — demo access control, not authentication.
            </strong>{" "}
            A single shared token gates these real submissions. There is no user
            model, no per-reviewer identity, and no audit trail of who changed
            what. Messages are stored redacted and deleted after 30 days by a
            TTL index.
          </p>
        ) : (
          <p className="max-w-2xl rounded-lg border border-pine/20 bg-white/40 p-4 text-sm text-pine/75">
            <strong className="text-pine">
              You are looking at fictional tickets.
            </strong>{" "}
            These seven are course fixtures from{" "}
            <code>data/inbound-queue.json</code>, classified by the same route
            that runs on the{" "}
            <a className="underline" href="/support">
              support form
            </a>
            . Real submissions are held behind <code>QUEUE_TOKEN</code>, because
            those are messages typed by members of the public — but the board
            itself is the thing worth showing, and it does not need them.
            Reviewer actions are read-only here.
          </p>
        )}
      </header>

      <QueueBoard />
    </div>
  );
}
