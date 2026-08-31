import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "@docusaurus/Link";
import queue from "@site/src/data/triaged-queue.json";
import styles from "./styles.module.css";

/**
 * Find the safety report: the queue, as a timed exercise.
 *
 * TicketQueue shows the before and after and asks you, in prose, to look for
 * the safety report first. Almost nobody does — the toggle is right there.
 * This component takes the same twenty tickets and makes you actually do it,
 * because the argument for `requires_human` only lands once you have felt how
 * long it takes to find the one that matters.
 *
 * Two tickets are safety escalations. That is not a flaw in the exercise, it
 * is the exercise: NW-T-1054 announces itself in the subject line and NW-T-1045
 * opens with "probably nothing". The gap between how long each one takes is the
 * whole point, so the result screen reports them separately.
 *
 * Ground truth comes from the same triaged-queue.json the rest of the site
 * uses — real classifications from a real run. Nothing here is hand-authored.
 */

type Ticket = (typeof queue.tickets)[number];

/** The one that reads as a safety report. Everyone finds this one. */
const OBVIOUS = "NW-T-1054";
/** The October 2025 incident. This is the one the exercise is about. */
const CAMOUFLAGED = "NW-T-1045";

const TARGETS = [OBVIOUS, CAMOUFLAGED];

/** Support volume from the scenario. Used only for the closing extrapolation. */
const TICKETS_PER_WEEK = 4100;

function timeOf(iso: string) {
  return new Date(iso).toISOString().slice(11, 16);
}

function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "5.7 hours", "48 minutes" — whichever reads better at that magnitude. */
function humanDuration(seconds: number) {
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}

type Phase = "intro" | "playing" | "done";

export default function FindTheTicket(): ReactNode {
  const tickets = queue.tickets as Ticket[];

  const [phase, setPhase] = useState<Phase>("intro");
  const [elapsed, setElapsed] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  /** Ticket id -> ms elapsed when it was found. */
  const [found, setFound] = useState<Record<string, number>>({});

  const startedAt = useRef(0);

  useEffect(() => {
    if (phase !== "playing") return;
    const t = setInterval(() => {
      setElapsed(Date.now() - startedAt.current);
    }, 100);
    return () => clearInterval(t);
  }, [phase]);

  const start = useCallback(() => {
    startedAt.current = Date.now();
    setElapsed(0);
    setWrong([]);
    setFound({});
    setPhase("playing");
  }, []);

  const reset = useCallback(() => {
    setPhase("intro");
    setElapsed(0);
    setWrong([]);
    setFound({});
  }, []);

  const guess = useCallback(
    (id: string) => {
      if (phase !== "playing") return;
      if (id in found || wrong.includes(id)) return;

      const at = Date.now() - startedAt.current;

      if (TARGETS.includes(id)) {
        const next = { ...found, [id]: at };
        setFound(next);
        if (TARGETS.every((t) => t in next)) {
          setElapsed(at);
          setPhase("done");
        }
        return;
      }

      setWrong((w) => [...w, id]);
    },
    [phase, found, wrong],
  );

  const remaining = TARGETS.length - Object.keys(found).length;

  const result = useMemo(() => {
    if (phase !== "done") return null;

    const obvious = found[OBVIOUS] ?? 0;
    const camo = found[CAMOUFLAGED] ?? 0;
    const total = Math.max(obvious, camo);
    const perTicket = total / 1000 / tickets.length;
    const atThisPace = perTicket * TICKETS_PER_WEEK;

    return {
      obvious,
      camo,
      total,
      wrongCount: wrong.length,
      /** True when the hard one came last, which is the usual outcome. */
      camoLast: camo >= obvious,
      gap: Math.abs(camo - obvious),
      atThisPace,
    };
  }, [phase, found, wrong, tickets.length]);

  return (
    <div className={styles.wrap}>
      {phase === "intro" && (
        <div className={styles.intro}>
          <p className={styles.introLead}>
            Twenty messages from one December morning, in the order they
            arrived. Same font, same weight, sorted by nothing.
          </p>
          <p>
            <strong>Two of them are safety reports.</strong> Somebody has to
            notice today. Click a message to flag it, and keep going until you
            have found both. Wrong guesses do not stop the clock.
          </p>
          <button type="button" className={styles.start} onClick={start}>
            Start
          </button>
          <p className={styles.introFoot}>
            No score is sent anywhere. The clock runs in your browser.
          </p>
        </div>
      )}

      {phase !== "intro" && (
        <div className={styles.hud} role="status" aria-live="polite">
          <span className={styles.clock}>{clock(elapsed)}</span>
          <span className={styles.hudStat}>
            {phase === "done"
              ? "both found"
              : `${remaining} left to find`}
          </span>
          <span className={styles.hudStat}>
            {wrong.length} wrong {wrong.length === 1 ? "guess" : "guesses"}
          </span>
        </div>
      )}

      {phase !== "intro" && (
        <ol className={styles.list}>
          {tickets.map((t) => {
            const isFound = t.id in found;
            const isWrong = wrong.includes(t.id);
            const settled = isFound || isWrong || phase === "done";

            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={[
                    styles.row,
                    isFound ? styles.hit : "",
                    isWrong ? styles.miss : "",
                    phase === "done" && !isFound ? styles.dim : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => guess(t.id)}
                  disabled={settled}
                  aria-label={`Flag ${t.subject} as a safety report`}
                >
                  <span className={styles.time}>{timeOf(t.received_at)}</span>

                  <span className={styles.main}>
                    <span className={styles.subject}>{t.subject}</span>
                    <span className={styles.snippet}>{t.message}</span>
                  </span>

                  <span className={styles.mark}>
                    {isFound
                      ? "safety"
                      : isWrong
                        ? "no"
                        : t.channel.replace(/_/g, " ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {result && (
        <div className={styles.result}>
          <p className={styles.resultHead}>
            Both found in <strong>{clock(result.total)}</strong>
            {result.wrongCount > 0 && (
              <>
                , after {result.wrongCount} wrong{" "}
                {result.wrongCount === 1 ? "guess" : "guesses"}
              </>
            )}
            .
          </p>

          <p>
            The legal notice took you{" "}
            <strong>{clock(Math.min(result.obvious, result.camo))}</strong>. It
            says <em>legal notice</em> in the subject line, so it was never
            going to hide.{" "}
            {result.camoLast ? (
              <>
                &ldquo;Hi, probably nothing, but&hellip;&rdquo; took{" "}
                <strong>{clock(result.camo)}</strong>, and it is the one where a
                child ended up in urgent care.
              </>
            ) : (
              <>
                You found &ldquo;Hi, probably nothing, but&hellip;&rdquo; first,
                which is unusual. That is the one where a child ended up in
                urgent care, and it is the one people normally read past.
              </>
            )}
          </p>

          <p>
            You were looking for it, you knew there were exactly two, and you had
            twenty messages. A December morning has more, the person reading them
            is answering the other nineteen as they go, and nobody tells them how
            many are in there. At the pace you just set, sorting{" "}
            {TICKETS_PER_WEEK.toLocaleString()} messages a week would take{" "}
            <strong>{humanDuration(result.atThisPace)}</strong> before anyone
            answers a single one.
          </p>

          <p>
            The classifier read all {tickets.length} in{" "}
            <strong>{queue.wall_clock_sec} seconds</strong> for{" "}
            <strong>${queue.total_cost_usd.toFixed(2)}</strong> and flagged both.
            That is not the interesting part. The interesting part is that it
            returned <strong>0.95</strong> confidence on the legal notice and{" "}
            <strong>0.88</strong> on the child
            {result.camoLast
                ? ", ranking them the way you did, and for the reason you did"
                : ", which is the ranking you just went against"}
            . The camouflage that slowed one of them down for you shows up in
            the model as a lower number. A score you can route on has to know
            which of its answers are the shaky ones.
          </p>

          <div className={styles.actions}>
            <Link className={styles.primary} to="/playground/queue">
              See what triage does to this queue
            </Link>
            <button type="button" className={styles.secondary} onClick={reset}>
              Play again
            </button>
          </div>

          <p className={styles.footnote}>
            Real output. All {tickets.length} classifications came from{" "}
            <code>{queue.model}</code> through the actual <code>/v1/triage</code>{" "}
            route. The confidence score is built in{" "}
            <Link to="/docs/labs/lab-2-structured-outputs">Lab 2</Link> and
            calibrated in{" "}
            <Link to="/docs/labs/lab-7-choosing-a-model">Lab 7</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
