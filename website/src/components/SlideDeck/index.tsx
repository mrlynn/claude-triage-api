import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { SLIDES } from "@site/src/data/talk";
import { connect, type Message } from "./sync";
import styles from "./styles.module.css";

/**
 * A projector for the intro talk. Content lives in src/data/talk.tsx; this
 * file only knows how to move between slides and get out of the way.
 *
 * Three constraints shaped it:
 *
 * 1. A LIVE ROOM IS UNFORGIVING. Nothing here can need a second window, a
 *    network call, or a click in the right place. Arrow keys and space, the
 *    two things every presenter's clicker sends, do the whole job.
 *
 * 2. WHAT YOU REHEARSE IS WHAT PROJECTS. The frame is locked to 16:9 and type
 *    scales off the frame's own width via container queries, so a slide that
 *    fits on a laptop fits on the projector. Sizing off the viewport instead
 *    would reflow the deck the moment it hits a different screen.
 *
 * 3. THE NOTES ARE FOR ONE PERSON. `S` opens them in-frame, which is the
 *    right answer on one screen. On a mirrored projector it is the wrong one
 *    — the room reads your notes with you — so `P` moves them into a second
 *    window that stays in step with this one. See sync.ts for how the two
 *    windows agree, and PresenterView.tsx for what the second one shows.
 */

/** Keys that advance. PageDown/PageUp are what most presenter clickers send. */
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown", " ", "PageDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp", "PageUp"]);

/**
 * The slide index lives in the hash, so a refresh mid-talk returns you to the
 * slide you were on and a slide is linkable. 1-based in the URL — "#3" should
 * mean the third slide to anyone reading it over your shoulder.
 */
function indexFromHash(hash: string): number | null {
  const n = Number.parseInt(hash.replace("#", ""), 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n - 1, 0), SLIDES.length - 1);
}

export default function SlideDeck(): ReactNode {
  // Always renders slide 0 on the server; the hash is read after mount, which
  // is the only moment it exists.
  const [index, setIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [isFullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The `hello` responder is registered once and must not close over a stale
  // index, and re-subscribing the channel on every slide change would drop
  // messages mid-flight. A ref is the cheap correct answer.
  const indexRef = useRef(0);
  indexRef.current = index;

  const go = useCallback((next: number) => {
    setIndex(Math.min(Math.max(next, 0), SLIDES.length - 1));
  }, []);

  useEffect(() => {
    const fromHash = indexFromHash(window.location.hash);
    if (fromHash !== null) setIndex(fromHash);
  }, []);

  // replaceState, not a hash assignment: pushing 8 entries onto history means
  // the browser Back button walks the deck backwards instead of leaving it.
  useEffect(() => {
    window.history.replaceState(null, "", `#${index + 1}`);
  }, [index]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen().catch(() => {});
  }, []);

  /**
   * The presenter window is opened with explicit dimensions because a plain
   * `window.open(url)` in most browsers produces a TAB, and a tab is useless
   * here — the whole point is a second surface visible at the same time as
   * the deck. Passing any size feature forces a real window.
   */
  const presenterUrl = useBaseUrl("/talk/presenter");
  const presenterRef = useRef<Window | null>(null);
  const [presenterBlocked, setPresenterBlocked] = useState(false);

  const openPresenter = useCallback(() => {
    const existing = presenterRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      return;
    }
    const width = Math.min(1100, Math.round(window.screen.availWidth * 0.62));
    const height = Math.min(760, Math.round(window.screen.availHeight * 0.72));
    const opened = window.open(
      presenterUrl,
      "nw-talk-presenter",
      `popup=yes,width=${width},height=${height},left=40,top=40`,
    );
    presenterRef.current = opened;
    setPresenterBlocked(!opened);
    // Notes in two places at once is the failure this feature exists to fix:
    // if the presenter window is up, the projector must not be showing them.
    if (opened) setNotesOpen(false);
  }, [presenterUrl]);

  /**
   * The deck is the only writer of the slide index. It publishes on every
   * change and answers `hello`, which is what lets a presenter window opened
   * (or reloaded) at any point catch up without the deck tracking who is
   * listening.
   */
  const link = useRef<ReturnType<typeof connect> | null>(null);

  useEffect(() => {
    const conn = connect((msg: Message) => {
      if (msg.type === "hello") {
        conn.publish({ index: indexRef.current, total: SLIDES.length, at: Date.now() });
      } else if (msg.type === "goto") {
        setIndex(Math.min(Math.max(msg.index, 0), SLIDES.length - 1));
      } else if (msg.type === "step") {
        setIndex((i) => Math.min(Math.max(i + msg.delta, 0), SLIDES.length - 1));
      }
    });
    link.current = conn;
    return () => {
      conn.close();
      link.current = null;
    };
  }, []);

  useEffect(() => {
    link.current?.publish({ index, total: SLIDES.length, at: Date.now() });
  }, [index]);

  /**
   * A heartbeat, so the presenter window can tell "nothing has changed" from
   * "nobody is there".
   *
   * The presenter could infer this from its own polling instead, and did at
   * first — but a browser throttles timers in an occluded window, so a
   * presenter window sitting behind something else would slow its own polling
   * and conclude the deck had died. Putting the pulse in the deck moves it to
   * the window that is, by definition, the one on screen.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      link.current?.publish({
        index: indexRef.current,
        total: SLIDES.length,
        at: Date.now(),
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // The site's search box is a keystroke away on every page. Never steal
      // typing.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (NEXT_KEYS.has(event.key)) {
        event.preventDefault();
        setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
      } else if (PREV_KEYS.has(event.key)) {
        event.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === "Home") {
        event.preventDefault();
        setIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        setIndex(SLIDES.length - 1);
      } else if (event.key === "s" || event.key === "S") {
        setNotesOpen((open) => !open);
      } else if (event.key === "f" || event.key === "F") {
        toggleFullscreen();
      } else if (event.key === "p" || event.key === "P") {
        openPresenter();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, openPresenter]);

  const slide = SLIDES[index];
  const remaining = SLIDES.slice(index + 1).reduce((n, s) => n + s.minutes, 0);

  return (
    <div
      ref={rootRef}
      className={styles.deck}
      data-fullscreen={isFullscreen ? "" : undefined}
      data-notes={notesOpen ? "" : undefined}
    >
      <section
        className={styles.frame}
        aria-roledescription="slide"
        aria-label={`${slide.title} — slide ${index + 1} of ${SLIDES.length}`}
      >
        {/* Keyed so a slide's own enter animation replays on every change. */}
        <article key={slide.id} className={styles.slide}>
          {slide.body}
        </article>
        <span className={styles.counter} aria-hidden="true">
          {index + 1} / {SLIDES.length}
        </span>
      </section>

      <nav className={styles.controls} aria-label="Slide navigation">
        <button
          type="button"
          className={styles.arrow}
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Previous slide"
        >
          ←
        </button>
        <ol className={styles.dots}>
          {SLIDES.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={styles.dot}
                data-current={i === index ? "" : undefined}
                onClick={() => go(i)}
                title={s.title}
                aria-label={`Go to ${s.title}`}
                aria-current={i === index ? "true" : undefined}
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          className={styles.arrow}
          onClick={() => go(index + 1)}
          disabled={index === SLIDES.length - 1}
          aria-label="Next slide"
        >
          →
        </button>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setNotesOpen((open) => !open)}
          aria-expanded={notesOpen}
          aria-controls="slide-notes"
        >
          {notesOpen ? "Hide notes" : "Speaker notes"} <kbd>S</kbd>
        </button>
        <button
          type="button"
          className={styles.toggle}
          onClick={openPresenter}
          title="Notes, next slide and a clock, in their own window"
        >
          Presenter view <kbd>P</kbd>
        </button>
        <button
          type="button"
          className={styles.toggle}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? "Exit" : "Full screen"} <kbd>F</kbd>
        </button>
      </nav>

      {presenterBlocked && (
        <p className={styles.blocked} role="status">
          The browser blocked the presenter window. Allow pop-ups for this site
          and press <kbd>P</kbd> again — or open{" "}
          <a href={presenterUrl} target="_blank" rel="noreferrer">
            the notes window
          </a>{" "}
          yourself; it will find the deck on its own.
        </p>
      )}

      {/* Rendered always, hidden when closed: toggling must not reflow the
          frame above it mid-sentence. Visible in fullscreen too — `S` doing
          nothing there would be a trap mid-talk; a presenter who is mirroring
          to a projector simply leaves it closed. */}
      <aside
        id="slide-notes"
        className={styles.notes}
        hidden={!notesOpen}
        aria-label="Speaker notes"
      >
        <header>
          <b>{slide.title}</b>
          <span>
            ~{slide.minutes} min on this slide · {remaining} min left in the deck
          </span>
        </header>
        <div className={styles.notesBody}>{slide.notes}</div>
        <footer>
          <kbd>←</kbd> <kbd>→</kbd> move · <kbd>S</kbd> notes · <kbd>P</kbd>{" "}
          presenter window · <kbd>F</kbd> full screen · <kbd>Home</kbd>{" "}
          <kbd>End</kbd> jump
        </footer>
      </aside>
    </div>
  );
}
