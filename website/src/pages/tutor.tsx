import { useCallback, useEffect, useState, type ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import { tutorApi } from "@site/src/components/Tutor/api";
import Intake from "@site/src/components/Tutor/Intake";
import PlanView from "@site/src/components/Tutor/PlanView";
import SessionRunner from "@site/src/components/Tutor/SessionRunner";
import { due, queue, record, weakSpots } from "@site/src/components/Tutor/leitner";
import { newProgress, useTutorState, type SessionProgress, type TutorState } from "@site/src/components/Tutor/store";
import type { DrillItem, Intake as IntakeInput, PlanSession } from "@site/src/components/Tutor/types";
import styles from "@site/src/components/Tutor/styles.module.css";

/**
 * The Tutor. The labs are the long form; this is the cram.
 *
 * One job, done the same way every time: take a timeframe, build a sequenced
 * plan from the course, run each session against a clock, and review the
 * learner's attempt before the next one. Everything it teaches comes from the
 * labs, and the storefront drops anything it cites that the labs do not have.
 */

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");

export default function TutorPage(): ReactNode {
  const { state, ready, update, reset } = useTutorState();
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prepare = useCallback(
    async (session: PlanSession, s: TutorState) => {
      if (!s.intake || s.lessons[session.n]) return s.lessons[session.n];
      const result = await tutorApi.lesson(session, s.intake.level, weakSpots(s.deck));
      update((cur) => ({ ...cur, lessons: { ...cur.lessons, [session.n]: result } }));
      return result;
    },
    [update],
  );

  const confirm = async (intake: IntakeInput) => {
    setBusy(true);
    setError(null);
    try {
      const { plan, meta, docs } = await tutorApi.plan(intake);
      const next: TutorState = { ...state, intake, plan, planMeta: meta, docs, lessons: {}, progress: {}, active: null };
      update(() => next);
      // "Done means" includes the first lesson, prepared — not just the outline.
      const first = plan.sessions[0];
      if (first) await prepare(first, next).catch((e) => setError(`Plan ready; first lesson failed: ${message(e)}`));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const start = async (n: number) => {
    const session = state.plan?.sessions.find((s) => s.n === n);
    if (!session) return;
    setError(null);
    let prepared = state.lessons[n];
    if (!prepared) {
      setPreparing(n);
      try {
        prepared = await prepare(session, state);
      } catch (e) {
        setError(message(e));
      } finally {
        setPreparing(null);
      }
    }
    if (!prepared) return;
    const lesson = prepared.lesson;
    update((s) => {
      const existing = s.progress[n];
      const progress: SessionProgress = existing
        ? existing.done || existing.phase === "wrap"
          ? existing
          : { ...existing, deadline: Date.now() + (existing.remaining ?? 0), remaining: undefined }
        : {
            ...newProgress(due(s.deck, n, lesson.drill).map((c) => c.item)),
            deadline: Date.now() + session.minutes * 60_000,
          };
      return { ...s, active: n, progress: { ...s.progress, [n]: progress } };
    });
  };

  const active = state.active;
  const updateActive = useCallback(
    (fn: (p: SessionProgress) => SessionProgress) =>
      update((s) => {
        const p = active !== null ? s.progress[active] : undefined;
        return p && active !== null ? { ...s, progress: { ...s.progress, [active]: fn(p) } } : s;
      }),
    [active, update],
  );
  const onRecord = useCallback(
    (item: DrillItem, correct: boolean) =>
      update((s) => ({ ...s, deck: record(s.deck, item, correct, active ?? 0) })),
    [active, update],
  );
  const onQueue = useCallback(
    (items: DrillItem[]) =>
      update((s) => ({ ...s, deck: items.reduce((d, item) => queue(d, item, active ?? 0), s.deck) })),
    [active, update],
  );

  const exit = () => {
    // Leaving the runner stops the clock; the plan view is not session time.
    updateActive((p) =>
      p.deadline !== undefined ? { ...p, deadline: undefined, remaining: Math.max(0, p.deadline - Date.now()) } : p,
    );
    update((s) => ({ ...s, active: null }));
  };

  const finish = () => {
    updateActive((p) => ({ ...p, done: true, deadline: undefined }));
    update((s) => ({ ...s, active: null }));
    // Prepare the next session now, so it is waiting — with this session's
    // misses already folded in as weak spots.
    const upcoming = state.plan?.sessions.find((s) => s.n !== active && !state.progress[s.n]?.done);
    if (upcoming) void prepare(upcoming, state).catch(() => undefined);
  };

  // Each view change is a new screen; keep the reader at the top of it.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [active, state.plan === null]);

  const session = active !== null ? state.plan?.sessions.find((s) => s.n === active) : undefined;
  const prepared = active !== null ? state.lessons[active] : undefined;
  const progress = active !== null ? state.progress[active] : undefined;

  return (
    <Layout
      title="The Tutor"
      description="Timed cram sessions on the Anthropic Messages API: a plan built from the labs, recall drills, and exercises reviewed before the next lesson."
    >
      <main className={`container ${styles.page}`}>
        {!session && (
          <header className={styles.hero}>
            <p className={styles.eyebrow}>The Tutor</p>
            <h1>Tell it how long you have. It builds the course; you show up for class.</h1>
            <p className={styles.lead}>
              Timed sessions on the Anthropic Messages API, built from{" "}
              <Link to="/docs/labs">the labs</Link>: a recall warm-up, a short brief, a drill, and one exercise the
              Tutor reviews and tells you what to fix before the next lesson. What you miss comes back until you
              don&rsquo;t.
            </p>
          </header>
        )}

        {!ready ? null : session && prepared && progress ? (
          <SessionRunner
            key={session.n}
            session={session}
            lesson={prepared.lesson}
            meta={prepared.meta}
            progress={progress}
            docs={state.docs}
            update={updateActive}
            onRecord={onRecord}
            onQueue={onQueue}
            onReview={async (attempt) => {
              const { review, meta } = await tutorApi.review(prepared.lesson, attempt);
              updateActive((p) => ({ ...p, attempts: [...p.attempts, { text: attempt, review, meta }] }));
            }}
            onFinish={finish}
            onExit={exit}
          />
        ) : state.plan && state.intake ? (
          <PlanView
            intake={state.intake}
            plan={state.plan}
            planMeta={state.planMeta}
            docs={state.docs}
            progress={state.progress}
            preparing={preparing}
            error={error}
            onStart={start}
            onReset={() => {
              reset();
              setError(null);
            }}
          />
        ) : (
          <Intake initial={state.intake} busy={busy} error={error} onConfirm={confirm} />
        )}
      </main>
    </Layout>
  );
}
