import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SLIDES } from "@site/src/data/talk";
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
 * 3. THE NOTES ARE FOR ONE PERSON. They render in-frame under the slide
 *    rather than in a synced second window: one surface, nothing to desync,
 *    and on a mirrored projector you simply close the panel. `S` toggles.
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
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

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
          onClick={toggleFullscreen}
        >
          {isFullscreen ? "Exit" : "Full screen"} <kbd>F</kbd>
        </button>
      </nav>

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
          <kbd>←</kbd> <kbd>→</kbd> move · <kbd>S</kbd> notes · <kbd>F</kbd> full
          screen · <kbd>Home</kbd> <kbd>End</kbd> jump
        </footer>
      </aside>
    </div>
  );
}
