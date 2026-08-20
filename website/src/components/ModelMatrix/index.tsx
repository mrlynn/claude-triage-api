import { useMemo, useState, type ReactNode } from "react";
import styles from "./styles.module.css";
import matrix from "@site/src/data/model-matrix.json";

/**
 * The Lab 7 tier comparison, rendered from a real run.
 *
 * `src/data/model-matrix.json` is emitted by
 * `npm run eval:models -- --emit-site`, so every number here is traceable to a
 * command rather than typed in by hand. Like every component in this
 * playground it calls nothing at runtime.
 *
 * The design point: accuracy is shown, but it is deliberately NOT the thing
 * the eye lands on. The disagreement grid and the calibration column are the
 * two readings that change a decision, and a single accuracy percentage is
 * the reading that most often does not.
 */

interface PerCase {
  id: string;
  passed: boolean;
  confidence: number;
}

interface ModelRow {
  model: string;
  effort_applied: boolean;
  accuracy: number;
  passed: number;
  total: number;
  latency_p50: number;
  latency_p95: number;
  cost_per_ticket: number;
  monthly_projection: number;
  calibration: { onPass: number | null; onFail: number | null; gap: number | null };
  per_case: PerCase[];
}

const DATA = matrix as unknown as {
  generated_at: string;
  generated_by: string;
  judge_model: string;
  judge_prompt_sha: string;
  tickets_per_week: number;
  monthly_budget: number;
  caveat: string;
  cases: { id: string; notes: string }[];
  models: ModelRow[];
};

const short = (m: string) => m.replace("claude-", "");

/** "n/a" beats a fabricated 0.00 — the runner makes the same choice. */
const fmt = (v: number | null, digits = 2) => (v === null ? "n/a" : v.toFixed(digits));

/**
 * How much signal the confidence score carries. Thresholds are chosen to
 * match what the labs claim: below ~0.1 there is nothing to route on.
 */
function gapVerdict(gap: number | null): { label: string; tone: "good" | "weak" | "none" } {
  if (gap === null) return { label: "no failures — nothing to measure", tone: "none" };
  if (gap >= 0.3) return { label: "usable for threshold routing", tone: "good" };
  if (gap >= 0.1) return { label: "weak but real", tone: "weak" };
  return { label: "no usable signal", tone: "none" };
}

export default function ModelMatrix(): ReactNode {
  const [selected, setSelected] = useState<string | null>(null);

  const caseNotes = useMemo(
    () => new Map(DATA.cases.map((c) => [c.id, c.notes])),
    [],
  );

  const contested = useMemo(() => {
    const out = new Set<string>();
    for (const c of DATA.cases) {
      const marks = DATA.models.map((m) => m.per_case.find((p) => p.id === c.id)?.passed);
      if (marks.some((x) => x === true) && marks.some((x) => x === false)) out.add(c.id);
    }
    return out;
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.provenance}>
        One run, {new Date(DATA.generated_at).toISOString().slice(0, 10)} ·{" "}
        <code>{DATA.generated_by}</code> · judge <code>{short(DATA.judge_model)}</code>{" "}
        (pinned, prompt <code>{DATA.judge_prompt_sha}</code>)
      </div>

      <p className={styles.caveat}>{DATA.caveat}</p>

      <div className={styles.cards}>
        {DATA.models.map((m) => {
          const verdict = gapVerdict(m.calibration.gap);
          const withinBudget = m.monthly_projection <= DATA.monthly_budget;
          return (
            <div key={m.model} className={styles.card}>
              <div className={styles.cardTitle}>{short(m.model)}</div>

              <div className={styles.metric}>
                <span className={styles.metricLabel}>accuracy</span>
                <span className={styles.metricValue}>
                  {m.passed}/{m.total}
                </span>
              </div>

              <div className={styles.metric}>
                <span className={styles.metricLabel}>$/mo @ {DATA.tickets_per_week.toLocaleString()}/wk</span>
                <span className={styles.metricValue}>
                  ${m.monthly_projection.toFixed(0)}
                  {withinBudget ? (
                    <span className={styles.ok}> under budget</span>
                  ) : (
                    <span className={styles.bad}> OVER</span>
                  )}
                </span>
              </div>

              <div className={styles.metric}>
                <span className={styles.metricLabel}>latency p50 / p95</span>
                <span className={styles.metricValue}>
                  {(m.latency_p50 / 1000).toFixed(1)}s / {(m.latency_p95 / 1000).toFixed(1)}s
                </span>
              </div>

              <div className={styles.metric}>
                <span className={styles.metricLabel}>calibration gap</span>
                <span className={styles.metricValue}>{fmt(m.calibration.gap)}</span>
              </div>
              <div className={`${styles.verdict} ${styles[verdict.tone]}`}>{verdict.label}</div>

              {!m.effort_applied && (
                <div className={styles.warn}>
                  rejects <code>output_config.effort</code> — ran with the parameter
                  dropped, not at low effort
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.gridTitle}>
        Which cases each model loses
        <span className={styles.gridHint}>
          {" "}
          — click a contested row for the rule it tests
        </span>
      </div>

      <div className={styles.scroll}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th>case</th>
              {DATA.models.map((m) => (
                <th key={m.model}>{short(m.model)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DATA.cases.map((c) => {
              const isContested = contested.has(c.id);
              return (
                <tr
                  key={c.id}
                  className={isContested ? styles.contested : undefined}
                  onClick={() => isContested && setSelected(selected === c.id ? null : c.id)}
                >
                  <td className={styles.caseId}>
                    {c.id}
                    {isContested ? <span className={styles.dot} aria-hidden="true" /> : null}
                  </td>
                  {DATA.models.map((m) => {
                    const hit = m.per_case.find((p) => p.id === c.id);
                    return (
                      <td key={m.model} className={hit?.passed ? styles.pass : styles.fail}>
                        {hit?.passed ? "·" : "X"}
                        <span className={styles.conf}>{hit ? hit.confidence.toFixed(2) : ""}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className={styles.note}>
          <strong>{selected}</strong> — {caseNotes.get(selected)}
        </div>
      )}
    </div>
  );
}
