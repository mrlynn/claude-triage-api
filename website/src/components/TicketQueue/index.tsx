import { useMemo, useState, type ReactNode } from "react";
import queue from "@site/src/data/triaged-queue.json";
import styles from "./styles.module.css";

/**
 * The support queue, before and after triage.
 *
 * Every classification rendered here came out of claude-opus-5 through the
 * real /v1/triage route. Regenerate with `npm run triage:queue`. Nothing on
 * this page is hand-authored, which is the point — a demo of a classifier
 * that invents its own results teaches the wrong lesson.
 *
 * The design rule for this component: every element must map to a schema
 * field or a policy constraint. It is not a support console. It exists to
 * show what `urgency`, `confidence` and `requires_human` are FOR, because
 * those fields are unjustifiable on paper and obvious in a queue.
 */

type Ticket = (typeof queue.tickets)[number];

const URGENCY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

const CATEGORY_LABEL: Record<string, string> = {
  billing: "Billing",
  shipping: "Shipping",
  product_defect: "Defect",
  returns: "Returns",
  account: "Account",
  safety: "Safety",
  other: "Other",
};

function timeOf(iso: string) {
  return new Date(iso).toISOString().slice(11, 16);
}

export default function TicketQueue(): ReactNode {
  const [triaged, setTriaged] = useState(false);

  const received = queue.tickets as Ticket[];

  const sorted = useMemo(() => {
    return [...received].sort((a, b) => {
      const ua =
        URGENCY_RANK[a.triage.urgency as keyof typeof URGENCY_RANK] ?? 9;
      const ub =
        URGENCY_RANK[b.triage.urgency as keyof typeof URGENCY_RANK] ?? 9;
      if (ua !== ub) return ua - ub;
      // Safety outranks inside a tier. Clause 5.4.
      const sa = a.triage.category === "safety" ? 0 : 1;
      const sb = b.triage.category === "safety" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return b.triage.confidence - a.triage.confidence;
    });
  }, [received]);

  const list = triaged ? sorted : received;

  const stats = useMemo(() => {
    const urgent = received.filter((t) => t.triage.urgency === "urgent").length;
    const human = received.filter((t) => t.triage.requires_human).length;
    const safety = received.filter((t) => t.triage.category === "safety").length;
    const lowConf = received.filter((t) => t.triage.confidence < 0.6).length;
    return { urgent, human, safety, lowConf };
  }, [received]);

  /** The incident ticket, and how far it moves. */
  const flagged = "NW-T-1045";
  const wasAt = received.findIndex((t) => t.id === flagged) + 1;
  const nowAt = sorted.findIndex((t) => t.id === flagged) + 1;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.toggle}>
          <button
            type="button"
            className={!triaged ? styles.tabActive : styles.tab}
            onClick={() => setTriaged(false)}
          >
            As received
          </button>
          <button
            type="button"
            className={triaged ? styles.tabActive : styles.tab}
            onClick={() => setTriaged(true)}
          >
            After triage
          </button>
        </div>

        <div className={styles.stats}>
          {triaged ? (
            <>
              <span>
                <strong>{stats.urgent}</strong> urgent
              </span>
              <span>
                <strong>{stats.safety}</strong> safety
              </span>
              <span>
                <strong>{stats.human}</strong> need a human
              </span>
              <span>
                <strong>{stats.lowConf}</strong> low confidence
              </span>
            </>
          ) : (
            <span className={styles.statsMuted}>
              {received.length} messages, in the order they arrived
            </span>
          )}
        </div>
      </div>

      <p className={triaged ? styles.callout : styles.calloutMuted}>
        {triaged ? (
          <>
            <strong>
              &ldquo;Hi, probably nothing, but&hellip;&rdquo; moved from position{" "}
              {wasAt} to position {nowAt}.
            </strong>{" "}
            That is the October 2025 incident. In the left-hand view it is an
            unremarkable line halfway down a busy morning. Nothing about its
            subject, its length, or its tone marks it out.
          </>
        ) : (
          <>
            This is what a December morning looks like to an agent. Twenty
            messages, same font, same weight, sorted by nothing but arrival
            time. One of them is a parent reporting that their child got sick.{" "}
            <strong>Find it.</strong>
          </>
        )}
      </p>

      <ol className={styles.list}>
        {list.map((t) => {
          const isFlagged = t.id === flagged;
          const urgency = t.triage.urgency;
          return (
            <li
              key={t.id}
              className={[
                styles.row,
                triaged ? styles[`u_${urgency}`] : "",
                triaged && isFlagged ? styles.spotlight : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className={styles.time}>{timeOf(t.received_at)}</span>

              <span className={styles.main}>
                <span className={styles.subject}>{t.subject}</span>
                <span className={styles.snippet}>{t.message}</span>
              </span>

              {triaged ? (
                <span className={styles.signals}>
                  <span className={`${styles.chip} ${styles[`c_${t.triage.category}`]}`}>
                    {CATEGORY_LABEL[t.triage.category] ?? t.triage.category}
                  </span>
                  <span className={`${styles.urg} ${styles[`ub_${urgency}`]}`}>
                    {urgency}
                  </span>
                  <span
                    className={styles.conf}
                    title={`confidence ${t.triage.confidence.toFixed(2)}`}
                  >
                    <span
                      className={
                        t.triage.confidence < 0.6 ? styles.confFillLow : styles.confFill
                      }
                      style={{ width: `${t.triage.confidence * 100}%` }}
                    />
                  </span>
                  {t.triage.requires_human && (
                    <span className={styles.human} title="requires_human">
                      human
                    </span>
                  )}
                </span>
              ) : (
                <span className={styles.channel}>{t.channel}</span>
              )}
            </li>
          );
        })}
      </ol>

      <p className={styles.footnote}>
        Real output. All {received.length} classifications came from{" "}
        <code>{queue.model}</code> through the actual <code>/v1/triage</code>{" "}
        route, for <strong>${queue.total_cost_usd.toFixed(2)}</strong>{" "}
        end to end. Regenerate with <code>npm run triage:queue</code>.
      </p>
    </div>
  );
}
