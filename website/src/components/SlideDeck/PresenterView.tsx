import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SLIDES } from "@site/src/data/talk";
import { connect, readSnapshot, type DeckState, type Message } from "./sync";
import deck from "./styles.module.css";
import styles from "./presenter.module.css";

/**
 * The notes window.
 *
 * What a presenter actually needs, in the order they need it: what to say,
 * what is on the screen behind them, what is coming next, and how long they
 * have been talking. Everything here is one of those four; anything else
 * competes with the room for attention.
 *
 * IT DRIVES, TOO. Arrow keys here move the deck, because the alternative is
 * clicking into the other window to advance — which on a mirrored display
 * means the room watches you hunt for a window. The deck stays the single
 * writer of the slide index; this window only ever asks.
 *
 * THE TIMER IS LOCAL. It belongs to the person, not to the deck, and keeping
 * it here means the presenter window can be closed and reopened mid-talk
 * without the deck knowing or caring. It is persisted so that reopening
 * resumes rather than restarts.
 */

const TIMER_KEY = "nw-talk-deck-timer";

type Timer = { startedAt: number | null; accumulated: number };

function readTimer(): Timer {
  try {
    const raw = window.localStorage.getItem(TIMER_KEY);
    if (raw) return JSON.parse(raw) as Timer;
  } catch {
    /* storage is optional here too */
  }
  return { startedAt: null, accumulated: 0 };
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The deck heartbeats every 2s. Three missed beats is a dead deck — long
 * enough not to flicker on a slow frame, short enough that a presenter
 * notices before they have talked to a screen nobody is watching.
 */
const SILENCE_MS = 6500;

/**
 * The presenter only needs to ask once, on open. It keeps asking on a slow
 * cadence anyway, for the case where this window was opened first and the
 * deck's own heartbeat has not started yet.
 */
const PING_MS = 5000;

export default function PresenterView(): ReactNode {
  const [state, setState] = useState<DeckState | null>(null);
  const [live, setLive] = useState(false);
  const [timer, setTimer] = useState<Timer>({ startedAt: null, accumulated: 0 });
  const [, tick] = useState(0);
  const post = useRef<((msg: Message) => void) | null>(null);
  const lastHeard = useRef(0);

  // Paint from the last known state immediately. The handshake below will
  // correct it within a frame or two, but an empty pane on open reads as
  // broken even when it is only early.
  useEffect(() => {
    setState(readSnapshot());
    setTimer(readTimer());
  }, []);

  useEffect(() => {
    const link = connect((msg) => {
      if (msg.type !== "state") return;
      lastHeard.current = Date.now();
      setLive(true);
      setState(msg.state);
    });
    post.current = link.post;

    link.post({ type: "hello" });
    const ping = window.setInterval(() => link.post({ type: "hello" }), PING_MS);

    // Liveness is judged against the deck's heartbeat, not against this
    // window's own polling — see the comment on SILENCE_MS. The 1s cadence
    // here only decides how promptly the indicator flips.
    const watch = window.setInterval(() => {
      setLive(
        lastHeard.current !== 0 && Date.now() - lastHeard.current < SILENCE_MS,
      );
    }, 1000);

    return () => {
      window.clearInterval(ping);
      window.clearInterval(watch);
      link.close();
      post.current = null;
    };
  }, []);

  const step = useCallback((delta: number) => {
    post.current?.({ type: "step", delta });
  }, []);

  const saveTimer = useCallback((next: Timer) => {
    setTimer(next);
    try {
      window.localStorage.setItem(TIMER_KEY, JSON.stringify(next));
    } catch {
      /* storage is optional; the clock still runs for this window's life */
    }
  }, []);

  const toggleTimer = useCallback(() => {
    setTimer((current) => {
      const next: Timer =
        current.startedAt === null
          ? { startedAt: Date.now(), accumulated: current.accumulated }
          : {
              startedAt: null,
              accumulated: current.accumulated + (Date.now() - current.startedAt),
            };
      try {
        window.localStorage.setItem(TIMER_KEY, JSON.stringify(next));
      } catch {
        /* as above */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(event.key)) {
        event.preventDefault();
        step(1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        step(-1);
      } else if (event.key === "t" || event.key === "T") {
        toggleTimer();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, toggleTimer]);

  // One re-render a second while the clock runs. Nothing else in this window
  // depends on it, so it stops the moment the clock is paused.
  useEffect(() => {
    if (timer.startedAt === null) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [timer.startedAt]);

  const elapsed =
    timer.accumulated +
    (timer.startedAt === null ? 0 : Date.now() - timer.startedAt);

  const index = Math.min(state?.index ?? 0, SLIDES.length - 1);
  const slide = SLIDES[index];
  const next = SLIDES[index + 1];
  const remaining = SLIDES.slice(index + 1).reduce((n, s) => n + s.minutes, 0);

  return (
    <div className={styles.presenter}>
      <header className={styles.bar}>
        <span className={styles.where}>
          <b>{index + 1}</b> / {SLIDES.length} · {slide.title}
        </span>

        <span className={styles.timing}>
          <button
            type="button"
            className={styles.clock}
            onClick={toggleTimer}
            data-running={timer.startedAt !== null ? "" : undefined}
            title="Start or pause (T)"
          >
            {clock(elapsed)}
          </button>
          <button
            type="button"
            className={styles.reset}
            onClick={() => saveTimer({ startedAt: null, accumulated: 0 })}
          >
            reset
          </button>
          <span className={styles.left}>
            ~{slide.minutes} min here · {remaining} min left
          </span>
        </span>

        <span className={styles.link} data-live={live ? "" : undefined}>
          {live ? "linked to the deck" : "deck not responding"}
        </span>
      </header>

      <div className={styles.body}>
        <section className={styles.notes} aria-label="Speaker notes">
          {slide.notes}
        </section>

        <aside className={styles.next} aria-label="Coming up">
          <p className={styles.label}>Next</p>
          {next ? (
            <>
              <b>{next.title}</b>
              {/*
                The real slide, not a description of it — it cannot drift from
                what the projector shows, because it IS what the projector
                shows.

                Rendered at full size and then scaled with a transform, rather
                than dropped into a small frame. The frame's container query
                would size the type proportionally right up until every clamp()
                hit its minimum, at which point the text stops shrinking and
                the slide overflows — a miniature that lies about what fits.
                A transform scales the finished pixels, so this cannot happen.
              */}
              <div className={styles.preview} aria-hidden="true">
                <div className={styles.previewScale}>
                  <div className={`${deck.frame} ${styles.previewFrame}`}>
                    <div className={deck.slide}>{next.body}</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <b>End of the deck.</b>
          )}
        </aside>
      </div>

      <footer className={styles.controls}>
        <button type="button" onClick={() => step(-1)} disabled={index === 0}>
          ← Back
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={index === SLIDES.length - 1}
        >
          Forward →
        </button>
        <span>
          Arrows move the deck · <kbd>T</kbd> starts the clock
        </span>
      </footer>
    </div>
  );
}
