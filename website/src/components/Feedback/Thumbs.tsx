import { useState, type ReactNode } from "react";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { FeedbackError, MAX_COMMENT_CHARS, sendFeedback, type FeedbackSurface, type Reason } from "./api";
import styles from "./styles.module.css";

const REASONS: { value: Reason; label: string }[] = [
  { value: "confusing", label: "Confusing" },
  { value: "incorrect", label: "Incorrect" },
  { value: "broken", label: "Something broke" },
  { value: "missing_something", label: "Missing something" },
  { value: "too_long", label: "Too long" },
  { value: "too_short", label: "Too short" },
];

type State =
  | { step: "idle" }
  | { step: "sending"; rating: "up" | "down" }
  | { step: "rated"; rating: "up" | "down"; id: string; open: boolean }
  | { step: "done"; rating: "up" | "down" };

/**
 * "Was this helpful?" with a thumbs up or down, and an optional follow-up.
 *
 * The rating is sent on the click, before anything else is asked: most people
 * will not write a comment, and a thumbs-down from someone who then closes the
 * tab is still the signal worth having. The follow-up amends that same record
 * rather than adding a second one, so one reader is one row.
 *
 * `compact` is for inline use under an assistant reply or a hint: icons only,
 * and the follow-up behind a link rather than opened for you.
 */
export default function Thumbs({
  surface,
  labIds,
  prompt = "Was this helpful?",
  compact = false,
}: {
  surface: FeedbackSurface;
  labIds?: string[];
  prompt?: ReactNode;
  compact?: boolean;
}) {
  const { baseUrl } = useDocusaurusContext().siteConfig;
  const [state, setState] = useState<State>({ step: "idle" });
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rate = async (rating: "up" | "down") => {
    setError(null);
    setState({ step: "sending", rating });
    try {
      const id = await sendFeedback({ baseUrl, surface, rating, labIds });
      // A thumbs-down opens the follow-up by itself outside compact mode: "what was wrong" is the useful half.
      setState({ step: "rated", rating, id, open: rating === "down" && !compact });
    } catch (e) {
      setState({ step: "idle" });
      setError(e instanceof FeedbackError ? e.message : "Feedback could not be sent.");
    }
  };

  const amend = async () => {
    if (state.step !== "rated") return;
    setSaving(true);
    setError(null);
    try {
      await sendFeedback({
        baseUrl,
        id: state.id,
        surface,
        rating: state.rating,
        reasons,
        comment: comment.trim() || null,
        labIds,
      });
      setState({ step: "done", rating: state.rating });
    } catch (e) {
      setError(e instanceof FeedbackError ? e.message : "Feedback could not be sent.");
    } finally {
      setSaving(false);
    }
  };

  const chosen = state.step === "idle" ? null : state.rating;

  return (
    <div className={compact ? styles.compact : styles.thumbs}>
      {state.step !== "done" && (
        <div className={styles.row}>
          {!compact && <span className={styles.prompt}>{prompt}</span>}
          {(["up", "down"] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={chosen === r ? styles.thumbOn : styles.thumb}
              aria-label={r === "up" ? "Helpful" : "Not helpful"}
              aria-pressed={chosen === r}
              disabled={state.step !== "idle"}
              onClick={() => rate(r)}
            >
              {r === "up" ? "👍" : "👎"}
            </button>
          ))}
          {state.step === "rated" && !state.open && (
            <>
              <span className={styles.muted}>Thanks.</span>
              <button type="button" className={styles.link} onClick={() => setState({ ...state, open: true })}>
                Tell us more
              </button>
            </>
          )}
        </div>
      )}

      {state.step === "rated" && state.open && (
        <div className={styles.more}>
          {state.rating === "down" && (
            <div className={styles.reasons} role="group" aria-label="What was wrong?">
              {REASONS.map((r) => {
                const on = reasons.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    className={on ? styles.chipOn : styles.chip}
                    aria-pressed={on}
                    onClick={() => setReasons(on ? reasons.filter((x) => x !== r.value) : [...reasons, r.value])}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          )}
          <textarea
            className={styles.comment}
            value={comment}
            maxLength={MAX_COMMENT_CHARS}
            rows={3}
            placeholder={state.rating === "down" ? "What would have helped? (optional)" : "What worked? (optional)"}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className={styles.row}>
            <button type="button" className="button button--sm button--primary" disabled={saving} onClick={amend}>
              {saving ? "Sending…" : "Send"}
            </button>
            <button type="button" className={styles.link} onClick={() => setState({ step: "done", rating: state.rating })}>
              No thanks
            </button>
            <span className={styles.fine}>
              Don&rsquo;t include personal details. <Link to="/privacy">Privacy</Link>
            </span>
          </div>
        </div>
      )}

      {state.step === "done" && <p className={styles.muted}>Thanks for the feedback.</p>}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
