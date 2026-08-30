import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./styles.module.css";

/**
 * Offline SSE teaching demo for Lab 4.
 *
 * No network. Replays a fixed draft as text / thinking / done events, then
 * optionally an in-band error after HTTP 200 — the failure mode the lab
 * exists to teach.
 */

const DRAFT =
  "Hi Dana — I looked up NW-48211. We can refund the $89 Trail Club renewal " +
  "to the original payment method within 5–7 business days. One apology for " +
  "the mix-up, and nothing that promises a same-day credit.";

const THINKING = "Member cancelled in June; renewal charged anyway → refund path.";

type Mode = "idle" | "streaming" | "done" | "error";

export default function StreamDemo(): ReactNode {
  const [mode, setMode] = useState<Mode>("idle");
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [failAfter, setFailAfter] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const push = (line: string) => setLog((prev) => [...prev, line]);

  const run = () => {
    clearTimers();
    setMode("streaming");
    setText("");
    setThinking("");
    setLog([]);
    push("HTTP 200 · stream open");

    let t = 0;
    const later = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    // Thinking arrives first (summarized), then text deltas.
    later((t += 400), () => {
      setThinking(THINKING);
      push("event: thinking");
    });

    const chunk = 3;
    for (let i = 0; i < DRAFT.length; i += chunk) {
      const slice = DRAFT.slice(i, i + chunk);
      const at = t + 40 * (i / chunk + 1);
      later(at, () => {
        setText((prev) => prev + slice);
        if (i === 0) push("event: text (deltas…)");
      });
    }

    const afterText = t + 40 * (DRAFT.length / chunk + 2);

    if (failAfter) {
      later(afterText, () => {
        setMode("error");
        push("event: error · mid-stream failure (status still 200)");
      });
      return;
    }

    later(afterText, () => {
      setMode("done");
      push(
        "event: done · stop_reason=end_turn · usage={in:412, out:86, cache_read:3358}",
      );
    });
  };

  const reset = () => {
    clearTimers();
    setMode("idle");
    setText("");
    setThinking("");
    setLog([]);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.primary} onClick={run}>
          {mode === "streaming" ? "Streaming…" : "Play stream"}
        </button>
        <button type="button" className={styles.ghost} onClick={reset}>
          Reset
        </button>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={failAfter}
            onChange={(e) => setFailAfter(e.target.checked)}
          />
          Fail mid-stream (in-band error)
        </label>
      </div>

      <div className={styles.panels}>
        <div className={styles.panel}>
          <p className={styles.label}>Draft (event: text)</p>
          <p className={styles.draft}>
            {text}
            {mode === "streaming" ? <span className={styles.caret} /> : null}
          </p>
          {thinking ? (
            <details className={styles.thinking} open>
              <summary>Thinking (event: thinking)</summary>
              <p>{thinking}</p>
            </details>
          ) : null}
          {mode === "error" ? (
            <p className={styles.error} role="alert">
              Stream error after 200 — show a failure state; do not keep the
              partial draft as final.
            </p>
          ) : null}
          {mode === "done" ? (
            <p className={styles.done}>Done — stop spinner, log usage.</p>
          ) : null}
        </div>
        <div className={styles.panel}>
          <p className={styles.label}>Event log</p>
          <ol className={styles.log}>
            {log.map((line, i) => (
              <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
