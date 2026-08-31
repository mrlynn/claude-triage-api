import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "@docusaurus/Link";
import queue from "@site/src/data/triaged-queue.json";
import styles from "./styles.module.css";

/**
 * Find the safety report: the queue, as a shift you can lose.
 *
 * TicketQueue shows the before and after and asks you, in prose, to look for
 * the safety report first. Almost nobody does — the toggle is right there.
 * This makes you actually do it, because the argument for `requires_human`
 * only lands once you have felt how long it takes to find the one that
 * matters.
 *
 * The mechanic is the domain: messages keep arriving while you read. That is
 * what makes it a game rather than a puzzle, and it is also just true. A
 * queue you can study at your leisure is not the queue anyone works.
 *
 * Deliberately not gamified with points, ranks or streaks. The payload is a
 * child in urgent care and a scoreboard on top of that reads as tasteless,
 * which costs more credibility than the engagement is worth. The pressure
 * comes from the clock, the penalty and the fail state instead — and the fail
 * state is the real incident: the shift ends with the report still unread.
 *
 * Ground truth is triaged-queue.json, the same real run the rest of the site
 * uses. Nothing here is hand-authored.
 *
 * The panel keeps its own ground in both colour modes rather than reading the
 * theme, because a console that repaints when you flip the site toggle is a
 * document again. See the head of styles.module.css for the contrast working.
 */

type Ticket = (typeof queue.tickets)[number];

/** The one that reads as a safety report. Everyone finds this one. */
const OBVIOUS = "NW-T-1054";
/** The October 2025 incident. This is the one the exercise is about. */
const CAMOUFLAGED = "NW-T-1045";

const TARGETS = [OBVIOUS, CAMOUFLAGED];

/** Support volume from the scenario. Used only for the closing extrapolation. */
const TICKETS_PER_WEEK = 4100;

/** How many are already waiting when the shift starts. */
const OPENING_BACKLOG = 6;
/** How often the next message lands, in ms. */
const ARRIVAL_MS = 2600;
/** What a wrong flag costs. Enough to make you read before you click. */
const PENALTY_MS = 10_000;

const BEST_KEY = "northwind.find.best";

function timeOf(iso: string) {
  return new Date(iso).toISOString().slice(11, 16);
}

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "5.7 hours", "48 minutes" — whichever reads better at that magnitude. */
function humanDuration(seconds: number) {
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}

function readBest(): number | null {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeBest(ms: number) {
  try {
    window.localStorage.setItem(BEST_KEY, String(ms));
  } catch {
    /* Private windows and blocked site data. A best time is not worth a crash. */
  }
}

/**
 * Arrival order for one shift.
 *
 * Shuffled so a second play is not a memory test, then constrained: neither
 * safety report may be in the opening backlog, and they may not arrive back to
 * back. Both of those produce a round that is over before the pressure starts.
 */
function dealOrder(tickets: Ticket[]): Ticket[] {
  for (let attempt = 0; attempt < 50; attempt++) {
    const deck = [...tickets];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const a = deck.findIndex((t) => t.id === TARGETS[0]);
    const b = deck.findIndex((t) => t.id === TARGETS[1]);
    if (Math.min(a, b) < OPENING_BACKLOG) continue;
    if (Math.abs(a - b) < 3) continue;
    return deck;
  }
  return [...tickets];
}

type Phase = "intro" | "playing" | "won" | "lost";

export default function FindTheTicket(): ReactNode {
  const all = queue.tickets as Ticket[];

  const [phase, setPhase] = useState<Phase>("intro");
  const [order, setOrder] = useState<Ticket[]>(all);
  const [arrived, setArrived] = useState(OPENING_BACKLOG);
  const [elapsed, setElapsed] = useState(0);
  const [penalty, setPenalty] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  /** Ticket id -> ms on the clock when it was flagged. */
  const [found, setFound] = useState<Record<string, number>>({});
  const [best, setBest] = useState<number | null>(null);
  const [beatBest, setBeatBest] = useState(false);

  const startedAt = useRef(0);
  const penaltyRef = useRef(0);
  /**
   * Mirrors `found`. Two flags clicked inside one render pass would otherwise
   * both read the same stale `found` from the closure, and the second would
   * drop the first — losing a win to nothing but fast fingers.
   */
  const foundRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setBest(readBest());
  }, []);

  const shown = useMemo(() => order.slice(0, arrived), [order, arrived]);

  /** The clock, and the messages that keep landing on it. */
  useEffect(() => {
    if (phase !== "playing") return;

    const tick = setInterval(() => {
      setElapsed(Date.now() - startedAt.current + penaltyRef.current);
    }, 100);

    const post = setInterval(() => {
      setArrived((n) => Math.min(n + 1, order.length));
    }, ARRIVAL_MS);

    return () => {
      clearInterval(tick);
      clearInterval(post);
    };
  }, [phase, order.length]);

  /** The shift ends when the last message has landed and one is still unread. */
  useEffect(() => {
    if (phase !== "playing") return;
    if (arrived < order.length) return;
    if (TARGETS.every((id) => id in found)) return;

    const grace = setTimeout(() => setPhase("lost"), ARRIVAL_MS);
    return () => clearTimeout(grace);
  }, [phase, arrived, order.length, found]);

  const start = useCallback(() => {
    penaltyRef.current = 0;
    foundRef.current = {};
    startedAt.current = Date.now();
    setOrder(dealOrder(all));
    setArrived(OPENING_BACKLOG);
    setElapsed(0);
    setPenalty(0);
    setWrong([]);
    setFound({});
    setBeatBest(false);
    setPhase("playing");
  }, [all]);

  const guess = useCallback(
    (id: string) => {
      if (phase !== "playing") return;
      if (id in foundRef.current || wrong.includes(id)) return;

      const at = Date.now() - startedAt.current + penaltyRef.current;

      if (!TARGETS.includes(id)) {
        penaltyRef.current += PENALTY_MS;
        setPenalty((p) => p + PENALTY_MS);
        setWrong((w) => [...w, id]);
        return;
      }

      const next = { ...foundRef.current, [id]: at };
      foundRef.current = next;
      setFound(next);

      if (TARGETS.every((t) => t in next)) {
        setElapsed(at);
        setPhase("won");
        const prior = readBest();
        if (prior === null || at < prior) {
          writeBest(at);
          setBeatBest(prior !== null);
          setBest(at);
        }
      }
    },
    [phase, wrong],
  );

  const unread = shown.filter(
    (t) => !(t.id in found) && !wrong.includes(t.id),
  ).length;
  const remaining = TARGETS.length - Object.keys(found).length;
  const toArrive = order.length - arrived;
  /*
   * The bar empties as the queue fills, because the round ends when the last
   * message lands — that is the threat, and the elapsed clock is only the
   * score. Ember from four out, which is roughly ten seconds of warning.
   */
  const shiftLeft = order.length ? toArrive / (order.length - OPENING_BACKLOG) : 0;

  const result = useMemo(() => {
    if (phase !== "won") return null;
    const obvious = found[OBVIOUS] ?? 0;
    const camo = found[CAMOUFLAGED] ?? 0;
    const total = Math.max(obvious, camo);
    return {
      obvious,
      camo,
      total,
      camoLast: camo >= obvious,
      atThisPace: (total / 1000 / all.length) * TICKETS_PER_WEEK,
    };
  }, [phase, found, all.length]);

  return (
    <div className={styles.stage}>
      <div className={styles.wrap}>
        <div className={styles.chrome}>
          <span>Northwind support &mdash; 14 December, morning shift</span>
          {phase === "playing" ? (
            <span className={styles.chromeLive}>
              <span className={styles.chromeDot} />
              receiving
            </span>
          ) : (
            <span>{phase === "intro" ? "not started" : "shift closed"}</span>
          )}
        </div>

        {phase === "intro" && (
          <div className={styles.intro}>
            <p className={styles.introLead}>
              You are covering the Northwind support queue on a December morning.
              Six messages are already waiting and more land while you read.
            </p>
            <p>
              <strong>Two of them are safety reports.</strong> Flag both before
              the last message arrives. A wrong flag costs you ten seconds, so
              read before you click.
            </p>
            <button type="button" className={styles.start} onClick={start}>
              Start the shift
            </button>
            {best !== null && (
              <p className={styles.bestLine}>
                Your best so far: <strong>{clock(best)}</strong>
              </p>
            )}
            <p className={styles.introFoot}>
              Nothing is sent anywhere. The clock and your best time stay in this
              browser.
            </p>
          </div>
        )}

        {phase !== "intro" && (
          <>
            <div className={styles.hud} role="status" aria-live="polite">
              {/*
                Keyed by the penalty count so the flash remounts and replays.
                Without the key the animation fires on the first wrong flag and
                never again, which is the one time you do not need telling.
              */}
              <span key={wrong.length} className={`${styles.clock} ${wrong.length > 0 ? styles.clockHit : ""}`}>
                {clock(elapsed)}
              </span>

              <span className={styles.pips} aria-label={`${remaining} still to find`}>
                {TARGETS.map((id) => (
                  <span
                    key={id}
                    className={`${styles.pip} ${id in found ? styles.pipOn : ""}`}
                  />
                ))}
              </span>

              <span className={styles.hudStat}>{unread} unread</span>
              {penalty > 0 && (
                <span className={styles.hudPenalty}>
                  +{Math.round(penalty / 1000)}s
                </span>
              )}

              <span className={`${styles.hudStat} ${styles.hudRight}`}>
                {phase === "playing"
                  ? toArrive > 0
                    ? `${toArrive} still to arrive`
                    : "last message in"
                  : phase === "won"
                    ? "both flagged"
                    : "shift over"}
              </span>
            </div>

            <div className={styles.doom}>
              <div
                className={`${styles.doomFill} ${toArrive <= 4 ? styles.doomCritical : ""}`}
                style={{ width: `${Math.max(0, Math.min(1, shiftLeft)) * 100}%` }}
              />
            </div>
          </>
        )}

        {phase !== "intro" && (
          <ol className={styles.list}>
            {shown.map((t) => {
              const isFound = t.id in found;
              const isWrong = wrong.includes(t.id);
              const isTarget = TARGETS.includes(t.id);
              const missed = phase === "lost" && isTarget && !isFound;

              return (
                <li key={t.id} className={styles.slot}>
                  <button
                    type="button"
                    className={[
                      styles.row,
                      isFound ? styles.hit : "",
                      isWrong ? styles.miss : "",
                      missed ? styles.missed : "",
                      phase !== "playing" && !isFound && !missed ? styles.dim : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => guess(t.id)}
                    disabled={phase !== "playing" || isFound || isWrong}
                    aria-label={`Flag ${t.subject} as a safety report`}
                  >
                    <span className={styles.time}>{timeOf(t.received_at)}</span>

                    <span className={styles.main}>
                      <span className={styles.subject}>{t.subject}</span>
                      <span className={styles.snippet}>{t.message}</span>
                    </span>

                    <span className={styles.mark}>
                      {isFound
                        ? "flagged"
                        : missed
                          ? "missed"
                          : isWrong
                            ? "not this one"
                            : t.channel.replace(/_/g, " ")}
                    </span>

                    {/* The ten seconds, leaving. */}
                    {isWrong && (
                      <span className={styles.penaltyFloat}>
                        +{PENALTY_MS / 1000}s
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {phase === "lost" && (
          <div className={styles.result}>
            <p className={styles.resultHead}>
              The shift ended with a safety report still in the queue.
            </p>
            <p>
              That is not a trick. It is the October 2025 incident, which is why
              this course has the scenario it has. A parent wrote in to say their
              child got sick, the message opened with{" "}
              <em>&ldquo;probably nothing&rdquo;</em>, and it sat unrouted for
              three days while everyone did their jobs properly.
            </p>
            <p>
              The classifier read all {all.length} in{" "}
              <strong>{queue.wall_clock_sec} seconds</strong> for{" "}
              <strong>${queue.total_cost_usd.toFixed(2)}</strong> and flagged both,
              which is the entire argument for the <code>requires_human</code>{" "}
              field.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryBtn} onClick={start}>
                Take another shift
              </button>
              <Link className={styles.secondaryLink} to="/playground/queue">
                See what triage does to this queue
              </Link>
            </div>
          </div>
        )}

        {result && (
          <div className={styles.result}>
            <p className={styles.resultHead}>
              Both flagged in <strong>{clock(result.total)}</strong>
              {penalty > 0 && (
                <>
                  , including {Math.round(penalty / 1000)} seconds of penalties
                </>
              )}
              .
            </p>

            {beatBest && <p className={styles.bestLine}>A new best.</p>}

            <p>
              The legal notice took you{" "}
              <strong>{clock(Math.min(result.obvious, result.camo))}</strong>. It
              says <em>legal notice</em> in the subject line, so it was never going
              to hide.{" "}
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
              You were looking for it, you knew there were exactly two, and you had{" "}
              {all.length} messages. A real December morning has more, the person
              reading them is answering the rest as they go, and nobody tells them
              how many are in there. At the pace you just set, sorting{" "}
              {TICKETS_PER_WEEK.toLocaleString()} messages a week would take{" "}
              <strong>{humanDuration(result.atThisPace)}</strong> before anyone
              answers a single one.
            </p>

            <p>
              The classifier read all {all.length} in{" "}
              <strong>{queue.wall_clock_sec} seconds</strong> for{" "}
              <strong>${queue.total_cost_usd.toFixed(2)}</strong> and flagged both.
              That is not the interesting part. The interesting part is that it
              returned <strong>0.95</strong> confidence on the legal notice and{" "}
              <strong>0.88</strong> on the child
              {result.camoLast
                ? ", ranking them the way you did, and for the reason you did"
                : ", which is the ranking you just went against"}
              . The camouflage that slowed one of them down for you shows up in the
              model as a lower number. A score you can route on has to know which
              of its answers are the shaky ones.
            </p>

            <div className={styles.actions}>
              <Link className={styles.primary} to="/playground/queue">
                See what triage does to this queue
              </Link>
              <button type="button" className={styles.secondary} onClick={start}>
                Another shift
              </button>
            </div>

            <p className={styles.footnote}>
              Real output. All {all.length} classifications came from{" "}
              <code>{queue.model}</code> through the actual <code>/v1/triage</code>{" "}
              route. The confidence score is built in{" "}
              <Link to="/docs/labs/lab-2-structured-outputs">Lab 2</Link> and
              calibrated in{" "}
              <Link to="/docs/labs/lab-7-choosing-a-model">Lab 7</Link>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
