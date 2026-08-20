import { connection } from "next/server";
import { Badge } from "@/components/charts";
import { HAS_MONGO } from "@/lib/mongo";
import { queueStats } from "@/lib/models";
import { usageSummary } from "@/lib/telemetry";

/**
 * The first number on this dashboard that comes from the database.
 *
 * Everything else on /ops is either SIMULATED (twelve months of invented
 * operating history for a fictional company) or MEASURED-but-static (figures
 * recorded from real runs and checked into `opsData.ts`). This section is
 * measured and live: it counts rows.
 *
 * It carries a `measured` badge for the same reason every other panel carries
 * one. The badge convention is enforced by nothing but habit, and the first
 * panel to quietly skip it is the one that kills it.
 *
 * A server component so the count is read at request time rather than shipped
 * to the browser as a client fetch — nobody needs a loading spinner for a
 * `countDocuments`.
 *
 * `await connection()` defers this subtree to request time. Without it the
 * whole page prerenders at build, and a "live" tile that was frozen when the
 * deploy ran is worse than no tile: it reports a number with total confidence
 * and no relationship to the database. The rest of /ops is invented history
 * and stays happily static, which is why this is scoped here rather than
 * turning the entire route dynamic.
 */
export default async function LiveQueue() {
  await connection();

  if (!HAS_MONGO) {
    return (
      <section className="rounded-lg border border-pine/15 bg-white/40 p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-pine">Escalation queue</h2>
          <Badge kind="measured" />
        </div>
        <p className="mt-2 text-sm text-pine/70">
          No database configured, so there is nothing to count. The support form
          still classifies; it simply cannot queue. A storage outage should
          degrade the queue, not the answer.
        </p>
      </section>
    );
  }

  let stats: Awaited<ReturnType<typeof queueStats>> | null = null;
  let usage: Awaited<ReturnType<typeof usageSummary>> = null;
  try {
    [stats, usage] = await Promise.all([queueStats(), usageSummary(30)]);
  } catch {
    stats = null;
  }

  if (!stats) {
    return (
      <section className="rounded-lg border border-pine/15 bg-white/40 p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-pine">Escalation queue</h2>
          <Badge kind="measured" />
        </div>
        <p className="mt-2 text-sm text-pine/70">
          The queue store is unreachable right now.
        </p>
      </section>
    );
  }

  const median =
    stats.medianTimeToClaimSec === null
      ? "n/a"
      : stats.medianTimeToClaimSec < 90
        ? `${Math.round(stats.medianTimeToClaimSec)}s`
        : `${Math.round(stats.medianTimeToClaimSec / 60)}m`;

  return (
    <section className="rounded-lg border border-pine/15 bg-white/40 p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-pine">Escalation queue</h2>
        <Badge kind="measured" />
      </div>
      <p className="mt-1 text-xs text-pine/60">
        Live row counts, not a projection. Tickets the classifier flagged{" "}
        <code>requires_human</code>, written by the pipeline&rsquo;s{" "}
        <code>persist</code> stage.
      </p>

      <div className="mt-4 flex flex-wrap gap-8">
        <Figure label="Waiting" value={String(stats.depth)} />
        <Figure label="Claimed" value={String(stats.claimed)} />
        <Figure label="Resolved" value={String(stats.resolved)} />
        <Figure
          label="Median time to claim"
          value={median}
          note={
            stats.medianTimeToClaimSec === null
              ? "nothing claimed yet"
              : "median — one ticket left overnight would swamp a mean"
          }
        />
      </div>

      <p className="mt-4 text-xs text-pine/55">
        Messages are stored redacted and deleted after 30 days by a TTL index.
        Tickets that did not need a human were never stored at all.
      </p>

      {usage && usage.calls > 0 && (
        <>
          <div className="mt-6 border-t border-pine/10 pt-5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-pine">
                Model usage, last {usage.days} days
              </h3>
              <Badge kind="measured" />
            </div>
            <p className="mt-1 text-xs text-pine/60">
              The same four usage fields the labs read, aggregated over real
              traffic. Counters only &mdash; one document per day, no per-request
              log, so there is nothing here to tie back to a visitor.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-8">
            <Figure label="Classified" value={usage.calls.toLocaleString()} />
            <Figure
              label="Cache hit rate"
              value={
                usage.cacheHitRate === null
                  ? "n/a"
                  : `${Math.round(usage.cacheHitRate * 100)}%`
              }
              note="a flat 0% here means a broken prefix, not a quiet week"
            />
            <Figure
              label="Cost per ticket"
              value={
                usage.costPerCallUsd === null
                  ? "n/a"
                  : `$${usage.costPerCallUsd.toFixed(4)}`
              }
              note={`$${usage.costUsd.toFixed(2)} total`}
            />
            <Figure
              label="Escalated"
              value={
                usage.calls > 0
                  ? `${Math.round((usage.escalated / usage.calls) * 100)}%`
                  : "n/a"
              }
              note={`${usage.escalated} of ${usage.calls}`}
            />
            {usage.blocked > 0 && (
              <Figure
                label="Rate-limited"
                value={usage.blocked.toLocaleString()}
                note="never reached the model, so excluded from cost"
              />
            )}
          </div>

          {usage.categories.length > 0 && (
            <div className="mt-5">
              <div className="text-[11px] uppercase tracking-wide text-pine/50">
                Category mix
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
                {usage.categories.map((c) => (
                  <span key={c.name} className="text-xs text-pine/75">
                    {c.name}{" "}
                    <span className="font-mono tabular-nums text-pine/50">
                      {Math.round((c.count / usage.calls) * 100)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Figure({
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
      <div className="font-mono text-2xl tabular-nums text-pine">{value}</div>
      {note && <div className="max-w-[16rem] text-[11px] text-pine/50">{note}</div>}
    </div>
  );
}
