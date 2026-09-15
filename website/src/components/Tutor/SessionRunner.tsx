import { useEffect, useState } from "react";
import AssistantMarkdown from "@site/src/components/AssistantMarkdown";
import Drill from "./Drill";
import { DocLinks, MetaLine } from "./PlanView";
import type { Phase, SessionProgress } from "./store";
import styles from "./styles.module.css";
import {
  LIMITS,
  type CallMeta,
  type DocRef,
  type DrillItem,
  type Hint,
  type Lesson,
  type PlanSession,
} from "./types";

/**
 * One timed session: warm-up → brief → drill → exercise → wrap-up.
 *
 * The clock is a stored deadline, not a ticking counter, so a reload or a
 * closed laptop does not hand back time. When it runs out the session jumps to
 * wrap-up and whatever drill items were not reached go into the deck, unscored:
 * running out of time is not the same as getting it wrong, but it is still
 * material you have not recalled.
 */

const STEPS: { id: Phase; label: string }[] = [
  { id: "warmup", label: "Warm-up" },
  { id: "brief", label: "Brief" },
  { id: "drill", label: "Drill" },
  { id: "exercise", label: "Exercise" },
  { id: "wrap", label: "Wrap-up" },
];

function remainingMs(p: SessionProgress, now: number): number {
  if (p.deadline !== undefined) return Math.max(0, p.deadline - now);
  return p.remaining ?? 0;
}

function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function score(items: DrillItem[], answers: Record<number, number>) {
  const total = Object.keys(answers).length;
  const right = Object.entries(answers).filter(([i, p]) => items[Number(i)]?.answer === p).length;
  return { right, total };
}

export default function SessionRunner({
  session,
  lesson,
  meta,
  progress,
  docs,
  update,
  onRecord,
  onQueue,
  onReview,
  onHint,
  onFinish,
  onExit,
}: {
  session: PlanSession;
  lesson: Lesson;
  meta: CallMeta;
  progress: SessionProgress;
  docs: DocRef[];
  update: (fn: (p: SessionProgress) => SessionProgress) => void;
  onRecord: (item: DrillItem, correct: boolean) => void;
  onQueue: (items: DrillItem[]) => void;
  onReview: (attempt: string) => Promise<void>;
  onHint: (question: string) => Promise<void>;
  onFinish: () => void;
  onExit: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const running = progress.deadline !== undefined && !progress.done;
  const left = remainingMs(progress, now);
  const docTitle = (id: string) => docs.find((d) => d.id === id)?.title.replace(/^Lab (\d+) — .*/, "Lab $1") ?? id;
  // Wrap-up is not session time: arriving there stops the clock.
  const go = (phase: Phase) =>
    update((p) =>
      phase === "wrap" && p.deadline !== undefined
        ? { ...p, phase, deadline: undefined, remaining: Math.max(0, p.deadline - Date.now()) }
        : { ...p, phase },
    );

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [progress.phase]);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [running]);

  // Time's up: close the session and queue what was not reached.
  useEffect(() => {
    if (!running || left > 0 || progress.phase === "wrap") return;
    onQueue(lesson.drill.filter((_, i) => progress.drill[i] === undefined));
    update((p) => ({ ...p, deadline: undefined, remaining: 0, timeUp: true, phase: "wrap" }));
  }, [running, left, progress.phase, progress.drill, lesson.drill, onQueue, update]);

  const pause = () => update((p) => ({ ...p, deadline: undefined, remaining: remainingMs(p, Date.now()) }));
  const resume = () => update((p) => ({ ...p, deadline: Date.now() + (p.remaining ?? 0), remaining: undefined }));

  const warm = score(progress.warmup.items, progress.warmup.answers);
  const drill = score(lesson.drill, progress.drill);
  const lastReview = progress.attempts.at(-1)?.review;
  const hints = progress.hints ?? [];
  const starter = lesson.starter?.code;
  // Reviewing the starter as given grades the Tutor's own planted bugs; that call teaches nothing.
  const untouched = starter !== undefined && progress.draft.trim() === starter.trim();

  const submit = async () => {
    setReviewing(true);
    setReviewError(null);
    try {
      await onReview(progress.draft);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "The review failed. Try again.");
    } finally {
      setReviewing(false);
    }
  };

  return (
    <section className={styles.runner}>
      <header className={styles.runnerHead}>
        <div>
          <p className={styles.eyebrow}>
            Session {session.n} · Day {session.day}
          </p>
          <h2 className={styles.runnerTitle}>{lesson.title}</h2>
        </div>
        <div className={left < 60_000 && running ? styles.clockLow : styles.clock} role="timer" aria-live="off">
          <span>{progress.done ? "done" : clock(left)}</span>
          {!progress.done && progress.phase !== "wrap" && (
            <button type="button" className="button button--sm button--secondary" onClick={running ? pause : resume}>
              {running ? "Pause" : "Resume"}
            </button>
          )}
        </div>
      </header>

      <nav className={styles.steps} aria-label="Session steps">
        {STEPS.filter((s) => s.id !== "warmup" || progress.warmup.items.length > 0).map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === progress.phase ? styles.stepOn : styles.step}
            onClick={() => go(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {!running && !progress.done && progress.phase !== "wrap" && (
        <p className={styles.paused}>Paused. The clock is stopped; resume when you are ready.</p>
      )}

      {progress.phase === "warmup" && (
        <>
          <p className={styles.muted}>
            {progress.warmup.items.length} question{progress.warmup.items.length === 1 ? "" : "s"} you missed or have
            not seen in a while.
          </p>
          <Drill
            label="Recall"
            items={progress.warmup.items}
            answers={progress.warmup.answers}
            docTitle={docTitle}
            doneLabel="On to the brief"
            onAnswer={(i, picked) => {
              const item = progress.warmup.items[i];
              if (item) onRecord(item, item.answer === picked);
              update((p) => ({ ...p, warmup: { ...p.warmup, answers: { ...p.warmup.answers, [i]: picked } } }));
            }}
            onDone={() => go("brief")}
          />
        </>
      )}

      {progress.phase === "brief" && (
        <div className={styles.panel}>
          <ul className={styles.brief}>
            {lesson.brief.map((b) => (
              <li key={b.point}>
                <AssistantMarkdown>{b.point}</AssistantMarkdown>
                <span className={styles.cite}>{docTitle(b.labId)}</span>
              </li>
            ))}
          </ul>
          <p className={styles.muted}>
            Go deeper: <DocLinks ids={session.labIds} docs={docs} />
          </p>
          <MetaLine meta={meta} what="Prepared" />
          <div className={styles.actions}>
            <button type="button" className="button button--primary" onClick={() => go("drill")}>
              Start the drill
            </button>
          </div>
        </div>
      )}

      {progress.phase === "drill" && (
        <Drill
          label="Drill"
          items={lesson.drill}
          answers={progress.drill}
          docTitle={docTitle}
          doneLabel="On to the exercise"
          onAnswer={(i, picked) => {
            const item = lesson.drill[i];
            if (item) onRecord(item, item.answer === picked);
            update((p) => ({ ...p, drill: { ...p.drill, [i]: picked } }));
          }}
          onDone={() => go("exercise")}
        />
      )}

      {progress.phase === "exercise" && (
        <div className={styles.panel}>
          <AssistantMarkdown>{lesson.exercise.prompt}</AssistantMarkdown>
          <p>
            <strong>Submit:</strong> {lesson.exercise.deliverable}
          </p>
          <details className={styles.rubric}>
            <summary>What the review checks</summary>
            <ul>
              {lesson.exercise.rubric.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>

          {lastReview?.verdict !== "pass" && (
            <StuckPanel
              hints={hints}
              labIds={session.labIds}
              docs={docs}
              onBrief={() => go("brief")}
              onHint={onHint}
            />
          )}

          {lastReview && <ReviewCard review={lastReview} attempt={progress.attempts.length} docs={docs} />}
          <MetaLine meta={progress.attempts.at(-1)?.meta} what="Reviewed" />

          {lastReview?.verdict !== "pass" && (
            <>
              {starter !== undefined && (
                <div className={styles.starterBar}>
                  <p className={styles.muted}>
                    The editor starts with code that runs but has problems. Fix it in place.
                  </p>
                  <button
                    type="button"
                    className="button button--sm button--link"
                    disabled={untouched}
                    onClick={() => {
                      if (window.confirm("Replace your draft with the original starter code?")) {
                        update((p) => ({ ...p, draft: starter }));
                      }
                    }}
                  >
                    Reset to starter
                  </button>
                </div>
              )}
              <textarea
                className={styles.attempt}
                value={progress.draft}
                maxLength={LIMITS.maxAttemptChars}
                spellCheck={false}
                // Code reads by line: scroll sideways inside the box rather than re-wrap it.
                wrap={starter !== undefined ? "off" : undefined}
                // Tall enough to read the whole starter without scrolling inside the box.
                rows={starter !== undefined ? Math.min(40, starter.split("\n").length + 2) : undefined}
                placeholder="Your attempt. Code, JSON, or a few sentences — whatever the exercise asks for."
                onChange={(e) => {
                  const draft = e.target.value;
                  update((p) => ({ ...p, draft }));
                }}
              />
              <p className={styles.meta}>
                {progress.draft.length.toLocaleString()} / {LIMITS.maxAttemptChars.toLocaleString()}
              </p>
            </>
          )}
          {reviewError && <p className={styles.error}>{reviewError}</p>}
          <div className={styles.actions}>
            {lastReview?.verdict === "pass" ? (
              <button type="button" className="button button--primary" onClick={() => go("wrap")}>
                Wrap up
              </button>
            ) : (
              <>
                <button type="button" className="button button--secondary" onClick={() => go("wrap")}>
                  Wrap up without passing
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  disabled={reviewing || progress.draft.trim().length === 0 || untouched}
                  title={untouched ? "Change the starter code first" : undefined}
                  onClick={submit}
                >
                  {reviewing ? "Reviewing…" : lastReview ? "Resubmit for review" : "Review my attempt"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {progress.phase === "wrap" && (
        <div className={styles.panel}>
          {progress.timeUp && <p className={styles.paused}>Time. Here is where you got to.</p>}
          <dl className={styles.stats}>
            {progress.warmup.items.length > 0 && (
              <div>
                <dt>Warm-up</dt>
                <dd>
                  {warm.right}/{progress.warmup.items.length}
                </dd>
              </div>
            )}
            <div>
              <dt>Drill</dt>
              <dd>
                {drill.right}/{lesson.drill.length}
              </dd>
            </div>
            <div>
              <dt>Exercise</dt>
              <dd>{lastReview ? (lastReview.verdict === "pass" ? "Passed" : "Revise") : "Not submitted"}</dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd>{progress.attempts.length}</dd>
            </div>
            {hints.length > 0 && (
              <div>
                <dt>Hints</dt>
                <dd>
                  {hints.length}/{LIMITS.maxHints}
                </dd>
              </div>
            )}
          </dl>
          {lastReview && lastReview.verdict !== "pass" && (
            <p>
              <strong>Before the next lesson:</strong> {lastReview.beforeNextLesson}
            </p>
          )}
          <p className={styles.muted}>
            Missed and unreached questions come back in the next session&rsquo;s warm-up.
          </p>
          <div className={styles.actions}>
            {progress.done ? (
              <button type="button" className="button button--primary" onClick={onExit}>
                Back to the plan
              </button>
            ) : (
              <button type="button" className="button button--primary" onClick={onFinish}>
                Finish session
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className="button button--sm button--link" onClick={onExit}>
          ← Plan
        </button>
      </div>
    </section>
  );
}

function ReviewCard({
  review,
  attempt,
  docs,
}: {
  review: NonNullable<SessionProgress["attempts"][number]["review"]>;
  attempt: number;
  docs: DocRef[];
}) {
  return (
    <div className={review.verdict === "pass" ? styles.reviewPass : styles.reviewRevise}>
      <p className={styles.verdict}>
        Attempt {attempt}: {review.verdict === "pass" ? "Pass" : "Revise"}
      </p>
      <ul className={styles.rubricResult}>
        {review.rubric.map((r) => (
          <li key={r.criterion} className={r.met ? styles.met : styles.missed}>
            <span aria-hidden="true">{r.met ? "✓" : "✗"}</span>
            <span>
              <b>{r.criterion}</b> {r.note}
            </span>
          </li>
        ))}
      </ul>
      {review.fixes.length > 0 && (
        <>
          <p className={styles.sub}>Fix before the next lesson</p>
          <ol className={styles.fixes}>
            {review.fixes.map((f) => (
              <li key={f.issue}>
                <b>{f.issue}</b> {f.why} {f.labRef && <DocLinks ids={[f.labRef]} docs={docs} />}
              </li>
            ))}
          </ol>
        </>
      )}
      {review.verdict === "revise" && (
        <p>
          <strong>Next:</strong> {review.beforeNextLesson}
        </p>
      )}
    </div>
  );
}

const HINT_LABEL: Record<Hint["level"], string> = { 1: "Nudge", 2: "Pointer", 3: "Partial step" };

/**
 * Somewhere to go that is not the back button. The free help comes first — the
 * labs this session teaches from and the brief, one click away — and then up to
 * three hints, each giving away more than the last. None of them writes the
 * deliverable; that is what the review is for. The clock keeps running, because
 * looking something up is part of doing the exercise.
 */
function StuckPanel({
  hints,
  labIds,
  docs,
  onBrief,
  onHint,
}: {
  hints: NonNullable<SessionProgress["hints"]>;
  labIds: string[];
  docs: DocRef[];
  onBrief: () => void;
  onHint: (question: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = LIMITS.maxHints - hints.length;

  const ask = async () => {
    setAsking(true);
    setError(null);
    try {
      await onHint(question.trim());
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The hint failed. Try again.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className={styles.stuck}>
      <p className={styles.sub}>Stuck?</p>
      <p className={styles.muted}>
        This is taught in <DocLinks ids={labIds} docs={docs} /> — or{" "}
        <button type="button" className={styles.inlineLink} onClick={onBrief}>
          re-read the brief
        </button>
        . Your draft is kept.
      </p>

      {hints.length > 0 && (
        <ol className={styles.hints}>
          {hints.map(({ hint }, i) => (
            <li key={i}>
              <span className={styles.cite}>
                Hint {i + 1} · {HINT_LABEL[hint.level]}
              </span>
              <AssistantMarkdown>{hint.text}</AssistantMarkdown>
              {hint.labRef && (
                <p className={styles.meta}>
                  Read more: <DocLinks ids={[hint.labRef]} docs={docs} />
                  {hint.lookFor ? ` — look for \u201c${hint.lookFor}\u201d` : ""}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
      <MetaLine meta={hints.at(-1)?.meta} what="Hinted" />

      {left > 0 ? (
        <div className={styles.hintAsk}>
          <input
            type="text"
            className={styles.hintQuestion}
            value={question}
            maxLength={LIMITS.maxQuestionChars}
            placeholder="What are you stuck on? (optional)"
            aria-label="What are you stuck on?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !asking) void ask();
            }}
          />
          <button type="button" className="button button--secondary" disabled={asking} onClick={ask}>
            {asking ? "Thinking…" : hints.length ? `Another hint (${left} left)` : "Give me a hint"}
          </button>
        </div>
      ) : (
        <p className={styles.muted}>
          That is all the hints. Submit what you have — the review says exactly what is missing and where to read.
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
