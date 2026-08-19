import { useMemo, useState, type ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import {
  MECHANICS,
  DIAGNOSIS,
  JUDGMENT,
  WEIGHTS,
  type ScoredQuestion,
} from "@site/src/data/assessment";
import styles from "./assessment.module.css";

/**
 * The assessment, auto-scored where auto-scoring is honest.
 *
 * Sections 1 and 2 are multiple choice and machine-marked. Section 3 is not,
 * because turning "how would you handle PHI in this design" into four options
 * would test whether you remember someone's opinion rather than whether you
 * can reason. Those are answered in writing and self-assessed against a rubric
 * that only appears after you commit an answer.
 *
 * Everything is local. Nothing is submitted anywhere.
 */

type Answers = Record<string, number>;

function Scored({
  question,
  index,
  picked,
  onPick,
  revealed,
}: {
  question: ScoredQuestion;
  index: number;
  picked?: number;
  onPick: (i: number) => void;
  revealed: boolean;
}) {
  const correct = picked === question.answer;

  return (
    <li className={styles.q}>
      <p className={styles.prompt}>
        <span className={styles.qnum}>{index}</span>
        {question.prompt}
      </p>
      <div className={styles.ansOptions}>
        {question.options.map((opt, i) => {
          const isPicked = picked === i;
          const isAnswer = i === question.answer;
          let cls = styles.ansOption;
          if (revealed && isAnswer) cls = styles.ansCorrect;
          else if (revealed && isPicked) cls = styles.ansWrong;
          else if (isPicked) cls = styles.ansPicked;
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={revealed}
              onClick={() => onPick(i)}
            >
              <span className={styles.ansLetter}>{String.fromCharCode(65 + i)}</span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className={correct ? styles.ansExplainRight : styles.ansExplainWrong}>
          <strong>{correct ? "Correct." : "Incorrect."}</strong> {question.explain}
        </div>
      )}
    </li>
  );
}

export default function AssessmentPage(): ReactNode {
  const [answers, setAnswers] = useState<Answers>({});
  const [revealed, setRevealed] = useState(false);
  const [written, setWritten] = useState<Record<string, string>>({});
  const [shownRubric, setShownRubric] = useState<Record<string, boolean>>({});
  const [selfScore, setSelfScore] = useState<Record<string, number>>({});

  const scored = [...MECHANICS, ...DIAGNOSIS];
  const answeredCount = scored.filter((q) => answers[q.id] !== undefined).length;

  const result = useMemo(() => {
    const hit = (qs: ScoredQuestion[]) =>
      qs.filter((q) => answers[q.id] === q.answer).length / qs.length;
    const mech = hit(MECHANICS);
    const diag = hit(DIAGNOSIS);
    const judged = JUDGMENT.filter((q) => selfScore[q.id] !== undefined);
    const judg =
      judged.length > 0
        ? judged.reduce((a, q) => a + selfScore[q.id]!, 0) / (judged.length * 2)
        : null;

    const auto = mech * WEIGHTS.mechanics + diag * WEIGHTS.diagnosis;
    const total =
      judg === null
        ? auto / (WEIGHTS.mechanics + WEIGHTS.diagnosis)
        : auto + judg * WEIGHTS.judgment;

    return { mech, diag, judg, total, judgedCount: judged.length };
  }, [answers, selfScore]);

  return (
    <Layout
      title="Assessment"
      description="Auto-scored assessment for the Claude API triage labs."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Assessment</Heading>
        <p className={styles.lead}>
          Twelve questions. The first eight are marked automatically. The last
          four are not, and that is deliberate — a multiple-choice version of
          &ldquo;how would you handle PHI in this design&rdquo; would test
          whether you remember an opinion, not whether you can reason. You
          answer those in writing and grade yourself against a rubric that
          appears once you commit.
        </p>
        <p className={styles.leadMuted}>
          Everything stays in your browser. Nothing is submitted anywhere.
        </p>

        {revealed && (
          <div className={styles.scorecard}>
            <div className={styles.scoreMain}>
              <span className={styles.scoreBig}>
                {Math.round(result.total * 100)}%
              </span>
              <span className={styles.scoreNote}>
                {result.judg === null
                  ? "sections 1–2 only"
                  : `all three sections, ${result.judgedCount}/4 self-assessed`}
              </span>
            </div>
            <div className={styles.scoreParts}>
              <Part label="Mechanics" pct={result.mech} weight={WEIGHTS.mechanics} />
              <Part label="Diagnosis" pct={result.diag} weight={WEIGHTS.diagnosis} />
              <Part
                label="Judgment"
                pct={result.judg}
                weight={WEIGHTS.judgment}
              />
            </div>
          </div>
        )}

        <Section
          title="Section 1 — Mechanics"
          weight="30%"
          blurb="API surface and parameters."
        >
          <ol className={styles.list}>
            {MECHANICS.map((q, i) => (
              <Scored
                key={q.id}
                question={q}
                index={i + 1}
                picked={answers[q.id]}
                revealed={revealed}
                onPick={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              />
            ))}
          </ol>
        </Section>

        <Section
          title="Section 2 — Diagnosis"
          weight="40%"
          blurb="Given a symptom, find the cause. Weighted heaviest on purpose: reciting that cache_control exists is worth little, recognising a flat-zero cache_read is the skill that transfers."
        >
          <ol className={styles.list}>
            {DIAGNOSIS.map((q, i) => (
              <Scored
                key={q.id}
                question={q}
                index={i + 5}
                picked={answers[q.id]}
                revealed={revealed}
                onPick={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              />
            ))}
          </ol>
        </Section>

        {!revealed && (
          <div className={styles.submitRow}>
            <button
              type="button"
              className="button button--primary button--lg"
              disabled={answeredCount < scored.length}
              onClick={() => setRevealed(true)}
            >
              {answeredCount < scored.length
                ? `${scored.length - answeredCount} left in sections 1–2`
                : "Mark sections 1 and 2"}
            </button>
          </div>
        )}

        <Section
          title="Section 3 — Design judgment"
          weight="30%"
          blurb="No answer key. Write your answer, then compare it against what a strong answer contains and score yourself honestly. A learner who picks the 'wrong' option with sound cost and latency reasoning should outscore one who picks the 'right' one from memory."
        >
          <ol className={styles.list}>
            {JUDGMENT.map((q, i) => (
              <li key={q.id} className={styles.q}>
                <p className={styles.prompt}>
                  <span className={styles.qnum}>{i + 9}</span>
                  {q.prompt}
                </p>
                <textarea
                  className={styles.textarea}
                  rows={5}
                  placeholder="Your answer..."
                  value={written[q.id] ?? ""}
                  onChange={(e) =>
                    setWritten((w) => ({ ...w, [q.id]: e.target.value }))
                  }
                  disabled={shownRubric[q.id]}
                />
                {!shownRubric[q.id] ? (
                  <button
                    type="button"
                    className={styles.commit}
                    disabled={(written[q.id] ?? "").trim().length < 40}
                    onClick={() =>
                      setShownRubric((r) => ({ ...r, [q.id]: true }))
                    }
                  >
                    {(written[q.id] ?? "").trim().length < 40
                      ? "Write an answer first"
                      : "Commit and show the rubric"}
                  </button>
                ) : (
                  <div className={styles.rubric}>
                    <p className={styles.rubricTitle}>
                      A strong answer covers
                    </p>
                    <ul>
                      {q.rubric.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                    <p className={styles.rubricTitle}>How did yours do?</p>
                    <div className={styles.selfScore}>
                      {[
                        { v: 0, label: "Missed most of it" },
                        { v: 1, label: "Got the main idea" },
                        { v: 2, label: "Covered it, with reasoning" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          className={
                            selfScore[q.id] === opt.v
                              ? styles.selfPicked
                              : styles.selfOption
                          }
                          onClick={() =>
                            setSelfScore((s) => ({ ...s, [q.id]: opt.v }))
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Section>

        <p className={styles.footer}>
          Weak on a section? Mechanics is{" "}
          <Link to="/docs/labs/lab-1-first-call">Labs 1</Link> and{" "}
          <Link to="/docs/labs/lab-2-structured-outputs">2</Link>. Diagnosis is{" "}
          <Link to="/docs/labs/lab-3-tool-use">3</Link> through{" "}
          <Link to="/docs/labs/lab-6-evals">6</Link>. Judgment is{" "}
          <Link to="/docs/architecture">the architecture notes</Link>.
        </p>
      </main>
    </Layout>
  );
}

function Part({
  label,
  pct,
  weight,
}: {
  label: string;
  pct: number | null;
  weight: number;
}) {
  return (
    <div className={styles.part}>
      <div className={styles.partHead}>
        <span>{label}</span>
        <span className={styles.partWeight}>{Math.round(weight * 100)}%</span>
      </div>
      <div className={styles.partTrack}>
        <div
          className={styles.partFill}
          style={{ width: `${(pct ?? 0) * 100}%` }}
        />
      </div>
      <span className={styles.partPct}>
        {pct === null ? "not assessed" : `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}

function Section({
  title,
  weight,
  blurb,
  children,
}: {
  title: string;
  weight: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <Heading as="h2">{title}</Heading>
        <span className={styles.weight}>{weight}</span>
      </div>
      <p className={styles.blurb}>{blurb}</p>
      {children}
    </section>
  );
}
