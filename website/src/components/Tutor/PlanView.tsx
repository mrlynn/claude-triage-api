import Link from "@docusaurus/Link";
import { scopeLine } from "./Intake";
import type { SessionProgress } from "./store";
import styles from "./styles.module.css";
import type { CallMeta, DocRef, Intake, Plan } from "./types";

export function MetaLine({ meta, what }: { meta: CallMeta | null | undefined; what: string }) {
  if (!meta) return null;
  return (
    <p className={styles.meta}>
      {what} by {meta.model} · ${meta.costUsd.toFixed(4)}
      {meta.cacheReadTokens > 0 ? ` · ${meta.cacheReadTokens.toLocaleString()} course tokens read from cache` : ""}
      {meta.dropped.length > 0 ? ` · removed unverifiable: ${meta.dropped.join(", ")}` : ""}
    </p>
  );
}

export function DocLinks({ ids, docs }: { ids: string[]; docs: DocRef[] }) {
  return (
    <span className={styles.docLinks}>
      {ids.map((id) => {
        const doc = docs.find((d) => d.id === id);
        return doc ? (
          <Link key={id} to={doc.path}>
            {doc.title}
          </Link>
        ) : (
          <span key={id}>{id}</span>
        );
      })}
    </span>
  );
}

export default function PlanView({
  intake,
  plan,
  planMeta,
  docs,
  progress,
  preparing,
  error,
  onStart,
  onReset,
}: {
  intake: Intake;
  plan: Plan;
  planMeta: CallMeta | null;
  docs: DocRef[];
  progress: Record<number, SessionProgress>;
  preparing: number | null;
  error: string | null;
  onStart: (n: number) => void;
  onReset: () => void;
}) {
  const next = plan.sessions.find((s) => !progress[s.n]?.done)?.n ?? null;
  const doneCount = plan.sessions.filter((s) => progress[s.n]?.done).length;

  return (
    <>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>
          Your plan · {doneCount} of {plan.sessions.length} done
        </p>
        <h2 className={styles.goal}>{plan.goal}</h2>
        <p className={styles.muted}>{scopeLine(intake)}</p>
        <h3 className={styles.sub}>Done means</h3>
        <ul className={styles.checks}>
          {plan.doneMeans.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        {plan.gaps.length > 0 && (
          <div className={styles.gaps}>
            <strong>Not covered by this plan</strong>
            <ul>
              {plan.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        )}
        <MetaLine meta={planMeta} what="Planned" />
      </section>

      {error && <p className={styles.error}>{error}</p>}

      <ol className={styles.sessions}>
        {plan.sessions.map((s) => {
          const p = progress[s.n];
          const state = p?.done ? "done" : p ? "started" : s.n === next ? "next" : "later";
          return (
            <li key={s.n} className={state === "next" || state === "started" ? styles.sessionNext : styles.session}>
              <span className={state === "done" ? styles.numDone : styles.num}>{state === "done" ? "✓" : s.n}</span>
              <div>
                <p className={styles.sessionDay}>
                  Day {s.day} · {s.minutes} min
                </p>
                <h3>{s.title}</h3>
                <p className={styles.muted}>{s.whyNow}</p>
                <ul className={styles.objectives}>
                  {s.objectives.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
                <DocLinks ids={s.labIds} docs={docs} />
              </div>
              <button
                type="button"
                className={`button button--sm ${state === "next" || state === "started" ? "button--primary" : "button--secondary"}`}
                disabled={preparing !== null}
                onClick={() => onStart(s.n)}
              >
                {preparing === s.n
                  ? "Preparing…"
                  : state === "done"
                    ? "Review"
                    : state === "started"
                      ? "Resume"
                      : "Start"}
              </button>
            </li>
          );
        })}
      </ol>

      <div className={styles.actions}>
        <button
          type="button"
          className="button button--sm button--link"
          onClick={() => {
            if (window.confirm("Discard this plan and all progress in this browser?")) onReset();
          }}
        >
          Start over with a new timeframe
        </button>
      </div>
    </>
  );
}
