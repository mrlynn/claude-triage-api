import { useEffect, useState } from "react";
import AssistantMarkdown from "@site/src/components/AssistantMarkdown";
import Drill from "./Drill";
import { DocLinks, MetaLine } from "./PlanView";
import type { Phase, SessionProgress } from "./store";
import styles from "./styles.module.css";
import { LIMITS, type CallMeta, type DocRef, type DrillItem, type Lesson, type PlanSession } from "./types";

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

          {lastReview && <ReviewCard review={lastReview} attempt={progress.attempts.length} docs={docs} />}
          <MetaLine meta={progress.attempts.at(-1)?.meta} what="Reviewed" />

          {lastReview?.verdict !== "pass" && (
            <>
              <textarea
                className={styles.attempt}
                value={progress.draft}
                maxLength={LIMITS.maxAttemptChars}
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
                  disabled={reviewing || progress.draft.trim().length === 0}
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
