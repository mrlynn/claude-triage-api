import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasQueueCookie } from "@/lib/queueAuth";
import QueueBoard from "./QueueBoard";

export const metadata: Metadata = {
  title: "Escalation queue — Northwind Outfitters",
  description: "Tickets the classifier flagged for a human.",
};

/**
 * Server component so it can read the cookie and exchange ?token= for one.
 * The board itself is a client component; this file only handles access.
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

  const allowed = await hasQueueCookie();

  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-12">
        <h1 className="text-2xl font-semibold text-pine">Escalation queue</h1>
        <p className="text-pine/75">
          This page shows support messages the classifier flagged for a human.
          Because those are real submissions from the public, it is not open.
        </p>
        <p className="rounded-lg border border-pine/15 bg-white/40 p-5 text-sm text-pine/70">
          Open <code>/queue?token=…</code> with the value of{" "}
          <code>QUEUE_TOKEN</code>. If that variable is unset, the queue is
          disabled rather than open — a missing secret must never mean &ldquo;no
          check required&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-[11px] uppercase tracking-wide text-pine/50">
          Internal
        </p>
        <h1 className="text-2xl font-semibold text-pine sm:text-3xl">
          Escalation queue
        </h1>
        <p className="max-w-2xl text-pine/75">
          Every ticket here was classified <code>requires_human: true</code> and
          written to the database by the <code>persist</code> stage of the
          triage pipeline. Tickets that did not need a human were classified and
          discarded — storage is a consequence of escalation, not of submission.
        </p>
        <p className="max-w-2xl rounded-lg border border-ember/30 bg-ember/5 p-4 text-sm text-pine/75">
          <strong className="text-pine">Demo access control, not authentication.</strong>{" "}
          A single shared token gates this page. There is no user model, no
          per-reviewer identity, and no audit trail of who changed what.
          Messages are stored redacted and deleted after 30 days by a TTL index.
        </p>
      </header>

      <QueueBoard />
    </div>
  );
}
