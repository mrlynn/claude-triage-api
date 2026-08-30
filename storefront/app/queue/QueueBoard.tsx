"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CATEGORY_CHIP,
  HUMAN_CHIP,
  urgencyChip,
} from "@/lib/triage-ui";

/**
 * The reviewer board.
 *
 * Columns by status, newest first. Always shows all four columns (empty
 * states included) so the board reads as an ops desk rather than a list that
 * collapses when quiet.
 */

type Status = "new" | "claimed" | "resolved" | "dismissed";

interface Escalation {
  _id: string;
  created_at: string;
  channel: string;
  message_redacted: string;
  redactions: { kind: string; at: number }[];
  triage?: {
    category: string;
    urgency: string;
    sentiment: string;
    summary: string;
    requires_human: boolean;
    escalation_reason: string | null;
    confidence: number;
  };
  source?: "form" | "assistant";
  assistant?: {
    proposalId: string;
    action: string;
    amountUsd?: number;
    rationale: string;
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

function urgencyBar(urgency?: string): string {
  if (urgency === "urgent") return "bg-ember";
  if (urgency === "high") return "bg-ember/50";
  if (urgency === "normal") return "bg-spruce/60";
  return "bg-pine/25";
}

export default function QueueBoard() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("demo");
  const [highlight, setHighlight] = useState<string | null>(null);

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

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;
    setHighlight(id);
    // Wait a tick for cards to paint, then scroll the target into view.
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, [items, loading]);

  async function clearAll() {
    if (
      !window.confirm(
        `Delete all ${items.length} escalation(s)? They are not recoverable.`,
      )
    ) {
      return;
    }
    setBusy("__all__");
    try {
      const res = await fetch("/api/queue", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail ?? "Could not clear the queue.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

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
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading the queue">
        <div className="h-24 animate-pulse rounded-lg bg-pine/8" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="space-y-3">
              <div className="h-3 w-20 animate-pulse rounded bg-pine/10" />
              <div className="h-36 animate-pulse rounded-lg bg-pine/8" />
              <div className="h-28 animate-pulse rounded-lg bg-pine/6" />
            </div>
          ))}
        </div>
      </div>
    );
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

      {mode === "demo" ? (
        <p className="text-xs text-pine/55">
          Read-only. Claim and Resolve act on real escalations and need{" "}
          <code>QUEUE_TOKEN</code>.
        </p>
      ) : (
        items.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={clearAll}
              disabled={busy === "__all__"}
              className="rounded-md border border-ember/40 px-3 py-1.5 text-xs text-ember hover:bg-ember hover:text-bone disabled:opacity-50"
            >
              {busy === "__all__" ? "Clearing…" : "Clear the queue"}
            </button>
            <span className="text-xs text-pine/55">
              For starting a session without the last room&rsquo;s submissions.
              Not recoverable.
            </span>
          </div>
        )
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const inCol = items.filter((i) => i.status === col.id);
          return (
            <section key={col.id} className="min-w-0 space-y-3">
              <h2 className="flex items-baseline justify-between gap-2 text-[11px] uppercase tracking-wide text-pine/50">
                <span>{col.label}</span>
                <span className="font-mono tabular-nums">{inCol.length}</span>
              </h2>
              {inCol.length === 0 ? (
                <div className="rounded-lg border border-dashed border-pine/20 bg-white/20 px-3 py-8 text-center text-xs text-pine/45">
                  {col.id === "new" && items.length === 0 ? (
                    <>
                      Nothing waiting. File something a human must handle on{" "}
                      <a className="underline" href="/support">
                        support
                      </a>
                      .
                    </>
                  ) : (
                    "Empty"
                  )}
                </div>
              ) : (
                inCol.map((item) => {
                  const source = item.source ?? (item.assistant ? "assistant" : "form");
                  const lit = highlight === item._id;
                  return (
                    <article
                      key={item._id}
                      id={item._id}
                      className={`overflow-hidden rounded-lg border bg-white/40 ${
                        lit
                          ? "border-ember ring-2 ring-ember/30"
                          : "border-pine/15"
                      }`}
                    >
                      <div
                        className={`h-1 ${urgencyBar(item.triage?.urgency)}`}
                        aria-hidden
                      />
                      <div className="p-4">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-mono text-sm text-pine">{item._id}</span>
                          <span className="text-[11px] text-pine/50">
                            {age(item.created_at)}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span
                            className={
                              source === "assistant"
                                ? "rounded bg-spruce/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pine"
                                : "rounded bg-pine/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pine/70"
                            }
                          >
                            {source === "assistant" ? "Ask Northwind" : "Support form"}
                          </span>
                        </div>

                        {item.triage && (
                          <>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className={CATEGORY_CHIP}>{item.triage.category}</span>
                              <span className={urgencyChip(item.triage.urgency)}>
                                {item.triage.urgency}
                              </span>
                              {item.triage.requires_human && (
                                <span className={HUMAN_CHIP}>human</span>
                              )}
                            </div>
                            <p className="mt-3 text-sm text-pine/85">{item.triage.summary}</p>
                            {item.triage.escalation_reason && (
                              <p className="mt-2 border-l-2 border-ember pl-3 text-xs text-pine/70">
                                {item.triage.escalation_reason}
                              </p>
                            )}
                          </>
                        )}

                        {item.assistant && (
                          <>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className={CATEGORY_CHIP}>{item.assistant.action}</span>
                              {typeof item.assistant.amountUsd === "number" && (
                                <span className={CATEGORY_CHIP}>
                                  ${item.assistant.amountUsd.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <p className="mt-3 text-sm text-pine/85">
                              Customer confirmed this with the assistant. Nothing
                              has been issued — this row is the request to action
                              it.
                            </p>
                          </>
                        )}

                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs text-pine/60">
                            {item.assistant
                              ? "Assistant rationale (redacted)"
                              : "Customer message (redacted)"}
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap rounded bg-pine/5 p-3 font-mono text-[11px] leading-relaxed text-pine/80">
                            {item.message_redacted}
                          </p>
                          {item.redactions.length > 0 && (
                            <p className="mt-1 text-[11px] text-ember">
                              {item.redactions.length} identifier
                              {item.redactions.length === 1 ? "" : "s"} removed
                              before storage
                            </p>
                          )}
                        </details>

                        <p className="mt-3 font-mono text-[11px] tabular-nums text-pine/50">
                          {item.triage
                            ? `conf ${item.triage.confidence.toFixed(2)} · `
                            : ""}
                          ${item.cost_usd.toFixed(4)} · {item.model}
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
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          );
        })}
      </div>
    </div>
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
