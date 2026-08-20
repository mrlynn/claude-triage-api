"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The reviewer board.
 *
 * Columns by status, newest first. Deliberately plain: the interesting thing
 * about this page is that it exists at all, not its interaction design. Before
 * it, `requires_human` was a boolean the schema produced and nothing acted on.
 */

type Status = "new" | "claimed" | "resolved" | "dismissed";

interface Escalation {
  _id: string;
  created_at: string;
  channel: string;
  message_redacted: string;
  redactions: { kind: string; at: number }[];
  triage: {
    category: string;
    urgency: string;
    sentiment: string;
    summary: string;
    requires_human: boolean;
    escalation_reason: string | null;
    confidence: number;
  };
  status: Status;
  claimed_by?: string;
  claimed_at?: string;
  model: string;
  cost_usd: number;
}

type Mode = "demo" | "live";

interface Stats {
  depth: number;
  medianTimeToClaimSec: number | null;
  claimed: number;
  resolved: number;
}

const COLUMNS: { id: Status; label: string }[] = [
  { id: "new", label: "New" },
  { id: "claimed", label: "Claimed" },
  { id: "resolved", label: "Resolved" },
  { id: "dismissed", label: "Dismissed" },
];

const URGENCY_STYLE: Record<string, string> = {
  low: "bg-pine/10 text-pine/70",
  normal: "bg-pine/10 text-pine/70",
  high: "bg-ember/15 text-ember",
  urgent: "bg-ember/25 text-ember",
};

/** Next status a reviewer can move a ticket to, and the button label. */
const ACTIONS: Record<Status, { to: Status; label: string }[]> = {
  new: [
    { to: "claimed", label: "Claim" },
    { to: "dismissed", label: "Dismiss" },
  ],
  claimed: [
    { to: "resolved", label: "Resolve" },
    { to: "new", label: "Release" },
  ],
  resolved: [],
  dismissed: [{ to: "new", label: "Reopen" }],
};

/**
 * Relative age, falling back to an absolute date.
 *
 * The demo fixtures are dated on Northwind's fictional timeline, which runs
 * ahead of the real clock. Clamping that to zero rendered every card as
 * "0s ago" — a relative time is only meaningful against a shared present, and
 * a board where everything arrived this instant is not one anybody would
 * believe. Anything future-dated or more than a week old shows its date
 * instead.
 */
function age(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 0 || sec > 7 * 86400) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  if (sec < 60) return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

export default function QueueBoard() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Demo mode hides the mutation buttons rather than letting them 401. A
  // control that is visible and always fails teaches the wrong thing about
  // the system.
  const [mode, setMode] = useState<Mode>("demo");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/queue");
      const body = await res.json();
      if (!res.ok) {
        setError(body.detail ?? "Could not load the queue.");
        return;
      }
      setItems(body.items as Escalation[]);
      setStats(body.stats as Stats);
      setMode((body.mode as Mode) ?? "demo");
      setError(null);
    } catch {
      setError("Could not reach the queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(id: string, to: Status) {
    setBusy(id);
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail ?? "That change did not stick.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-pine/60">Loading the queue…</p>;
  }

  return (
    <div className="space-y-5">
      {stats && (
        <div className="flex flex-wrap gap-6 rounded-lg border border-pine/15 bg-white/40 p-5">
          <Stat label="Waiting" value={String(stats.depth)} />
          <Stat label="Claimed" value={String(stats.claimed)} />
          <Stat label="Resolved" value={String(stats.resolved)} />
          <Stat
            label="Median time to claim"
            value={
              stats.medianTimeToClaimSec === null
                ? "n/a"
                : stats.medianTimeToClaimSec < 90
                  ? `${Math.round(stats.medianTimeToClaimSec)}s`
                  : `${Math.round(stats.medianTimeToClaimSec / 60)}m`
            }
            note={
              stats.medianTimeToClaimSec === null
                ? "nothing claimed yet"
                : "median, not mean"
            }
          />
        </div>
      )}

      {error && (
        <p className="rounded-md bg-ember/10 px-3 py-2 text-sm text-ember">{error}</p>
      )}

      {mode === "demo" && (
        <p className="text-xs text-pine/55">
          Read-only. Claim and Resolve act on real escalations and need{" "}
          <code>QUEUE_TOKEN</code>.
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-pine/20 bg-white/20 p-6 text-sm text-pine/60">
          Nothing queued. File a ticket on{" "}
          <a className="underline" href="/support">
            the support form
          </a>{" "}
          describing something a human would have to handle — an injury, a legal
          threat, a large refund — and it will land here.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {COLUMNS.map((col) => {
            const inCol = items.filter((i) => i.status === col.id);
            if (inCol.length === 0) return null;
            return (
              <section key={col.id} className="space-y-3">
                <h2 className="text-[11px] uppercase tracking-wide text-pine/50">
                  {col.label} ({inCol.length})
                </h2>
                {inCol.map((item) => (
                  <article
                    key={item._id}
                    className="rounded-lg border border-pine/15 bg-white/40 p-5"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-sm text-pine">{item._id}</span>
                      <span className="text-[11px] text-pine/50">
                        {age(item.created_at)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Chip>{item.triage.category}</Chip>
                      <span
                        className={`rounded px-2 py-1 text-xs ${
                          URGENCY_STYLE[item.triage.urgency] ?? "bg-pine/10 text-pine/70"
                        }`}
                      >
                        {item.triage.urgency}
                      </span>
                      <Chip>{item.triage.sentiment}</Chip>
                    </div>

                    <p className="mt-3 text-sm text-pine/85">{item.triage.summary}</p>

                    {item.triage.escalation_reason && (
                      <p className="mt-2 border-l-2 border-ember pl-3 text-xs text-pine/70">
                        {item.triage.escalation_reason}
                      </p>
                    )}

                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-pine/60">
                        Customer message (redacted)
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap rounded bg-pine/5 p-3 font-mono text-[11px] leading-relaxed text-pine/80">
                        {item.message_redacted}
                      </p>
                      {item.redactions.length > 0 && (
                        <p className="mt-1 text-[11px] text-ember">
                          {item.redactions.length} identifier
                          {item.redactions.length === 1 ? "" : "s"} removed before
                          storage
                        </p>
                      )}
                    </details>

                    <p className="mt-3 font-mono text-[11px] tabular-nums text-pine/50">
                      conf {item.triage.confidence.toFixed(2)} · ${item.cost_usd.toFixed(4)} ·{" "}
                      {item.model}
                      {item.claimed_by ? ` · ${item.claimed_by}` : ""}
                    </p>

                    {mode === "live" && ACTIONS[item.status].length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {ACTIONS[item.status].map((a) => (
                          <button
                            key={a.to}
                            type="button"
                            disabled={busy === item._id}
                            onClick={() => move(item._id, a.to)}
                            className="rounded-md border border-pine/20 px-3 py-1.5 text-xs text-pine hover:bg-pine hover:text-bone disabled:opacity-50"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-pine/10 px-2 py-1 text-xs text-pine/80">{children}</span>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-pine/50">{label}</div>
      <div className="font-mono text-xl tabular-nums text-pine">{value}</div>
      {note && <div className="text-[11px] text-pine/50">{note}</div>}
    </div>
  );
}
