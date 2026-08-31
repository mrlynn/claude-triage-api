import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import Link from "@docusaurus/Link";
import matrix from "@site/src/data/model-matrix.json";
import styles from "./styles.module.css";

/**
 * Set the policy: the routing decision, as something you can get wrong.
 *
 * Every other playground on this site shows you what the classifier returned.
 * This one asks the question that comes after — you have a label and a
 * confidence score, so what do you actually DO with them — because that is the
 * decision an engineer owns and the labs never get to make you make.
 *
 * Everything on the field is a real eval case from model-matrix.json: real
 * pass/fail, real confidence, real cost and latency. The three assumptions the
 * simulation adds on top (minutes per manual triage, loaded hourly rate, and
 * that the 12-case eval rate holds across the week) are stated on the page
 * rather than buried here, because the whole argument of the course is that a
 * number you cannot audit is worth nothing.
 *
 * The lesson is in the data and was not designed in: Haiku gets the safety case
 * wrong while reporting 0.95 confidence. No threshold catches a wrong answer at
 * 0.95. The only control that does is the unconditional category rule, which is
 * why handbook 5.4 reads the way it does. A player who reaches for the cheap
 * model and a clever threshold has to discover 5.4 by needing it.
 */

type ModelRow = (typeof matrix.models)[number];
type CaseRow = ModelRow["per_case"][number];

/** The eval case the handbook is about. Matched from the case notes, not hardcoded prose. */
const SAFETY_CASE = matrix.cases.find((c) =>
  c.notes.toLowerCase().includes("safety"),
)?.id;

const WEEK = matrix.tickets_per_week;

/** Stated on the page. Change these and the page copy changes with them. */
const MINUTES_PER_MANUAL_TRIAGE = 2;
const LOADED_HOURLY_RATE = 28;

const SHORT: Record<string, string> = {
  "claude-opus-5": "Opus 5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-haiku-4-5": "Haiku 4.5",
};

function money(n: number) {
  return n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;
}

type Outcome = {
  autoRate: number;
  /** Wrong answers routed with no human in the loop. The number that matters. */
  escaped: CaseRow[];
  /** Wrong answers a human will now catch. */
  caught: CaseRow[];
  /** Right answers a human reads anyway. Pure cost, and the price of the safety net. */
  wasted: CaseRow[];
  safetyEscaped: boolean;
  humanPerWeek: number;
  humanHours: number;
  humanCost: number;
  modelCost: number;
  totalCost: number;
  escapedPerWeek: number;
};

function simulate(
  model: ModelRow,
  threshold: number,
  safetyRule: boolean,
): Outcome {
  const cases = model.per_case;

  const routed = cases.map((c) => {
    const forcedToHuman = safetyRule && c.id === SAFETY_CASE;
    const auto = !forcedToHuman && c.confidence >= threshold;
    return { c, auto };
  });

  const autoCases = routed.filter((r) => r.auto).map((r) => r.c);
  const humanCases = routed.filter((r) => !r.auto).map((r) => r.c);

  const escaped = autoCases.filter((c) => !c.passed);
  const caught = humanCases.filter((c) => !c.passed);
  const wasted = humanCases.filter((c) => c.passed);

  const autoRate = autoCases.length / cases.length;
  const humanPerWeek = WEEK * (1 - autoRate);
  const humanHours = (humanPerWeek * MINUTES_PER_MANUAL_TRIAGE) / 60;
  const humanCost = humanHours * LOADED_HOURLY_RATE;
  const modelCost = WEEK * model.cost_per_ticket;

  return {
    autoRate,
    escaped,
    caught,
    wasted,
    safetyEscaped: escaped.some((c) => c.id === SAFETY_CASE),
    humanPerWeek,
    humanHours,
    humanCost,
    modelCost,
    totalCost: humanCost + modelCost,
    escapedPerWeek: (WEEK * escaped.length) / cases.length,
  };
}

/* ---------------------------------------------------------------- the field */

const FIELD_W = 620;
const FIELD_H = 400;
const PAD_T = 26;
const PAD_B = 30;
const PAD_L = 62;
const PAD_R = 20;
const PLOT_H = FIELD_H - PAD_T - PAD_B;
const PLOT_W = FIELD_W - PAD_L - PAD_R;
const DOT_R = 8;

const yOf = (conf: number) => PAD_T + (1 - conf) * PLOT_H;

/**
 * Beeswarm placement.
 *
 * Half this eval set lands between 0.90 and 0.95, so on an honest 0-1 axis the
 * top of the field is one pile. Separating only exactly-equal confidences is
 * not enough — anything within a dot diameter collides. So: walk the cases in
 * y order and step each one sideways until it clears every dot already placed
 * that is close enough vertically to overlap it. The y value is never moved,
 * because y is the data.
 */
function swarm(cases: CaseRow[]) {
  const sorted = [...cases].sort((a, b) => b.confidence - a.confidence);
  const centre = PAD_L + PLOT_W * 0.44;
  const step = DOT_R * 2 + 5;
  const placed: Array<{ c: CaseRow; x: number; y: number }> = [];

  for (const c of sorted) {
    const y = yOf(c.confidence);
    const near = placed.filter((p) => Math.abs(p.y - y) < DOT_R * 2 + 2);
    let x = centre;
    for (let ring = 0; ring < 12; ring++) {
      /* centre, then right, then left, widening each time */
      const candidates =
        ring === 0 ? [centre] : [centre + ring * step, centre - ring * step];
      const free = candidates.find((cand) =>
        near.every((p) => Math.abs(p.x - cand) >= step - 1),
      );
      if (free !== undefined) {
        x = free;
        break;
      }
    }
    placed.push({ c, x, y });
  }
  return placed;
}

export default function PolicyDesk(): ReactNode {
  const models = matrix.models as ModelRow[];

  const [modelId, setModelId] = useState(models[0].model);
  const [threshold, setThreshold] = useState(0.75);
  const [safetyRule, setSafetyRule] = useState(false);
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const fieldRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);

  const model = models.find((m) => m.model === modelId) ?? models[0];
  const outcome = useMemo(
    () => simulate(model, threshold, safetyRule),
    [model, threshold, safetyRule],
  );
  const placed = useMemo(() => swarm(model.per_case), [model]);

  const noteFor = useCallback(
    (id: string) => matrix.cases.find((c) => c.id === id)?.notes ?? "",
    [],
  );

  /** Any change to the policy invalidates the last run. */
  useEffect(() => {
    setRan(false);
  }, [modelId, threshold, safetyRule]);

  const setFromPointer = useCallback((clientY: number) => {
    const svg = fieldRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const yInSvg = ((clientY - box.top) / box.height) * FIELD_H;
    const conf = 1 - (yInSvg - PAD_T) / PLOT_H;
    setThreshold(Math.min(1, Math.max(0, Math.round(conf * 100) / 100)));
  }, []);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setFromPointer(e.clientY);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    setFromPointer(e.clientY);
  };
  const endDrag = () => {
    dragging.current = false;
  };

  const nudge = (delta: number) =>
    setThreshold((t) => Math.min(1, Math.max(0, Math.round((t + delta) * 100) / 100)));

  const run = () => {
    setRunning(true);
    setRan(false);
    window.setTimeout(() => {
      setRunning(false);
      setRan(true);
    }, 1500);
  };

  const bladeY = yOf(threshold);
  const perfect = outcome.escaped.length === 0;

  return (
    <div className={styles.desk}>
      {/* ------------------------------------------------------- the controls */}
      <div className={styles.controls}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Model</legend>
          <div className={styles.models}>
            {models.map((m) => (
              <button
                key={m.model}
                type="button"
                className={m.model === modelId ? styles.modelOn : styles.model}
                onClick={() => setModelId(m.model)}
                aria-pressed={m.model === modelId}
              >
                <span className={styles.modelName}>{SHORT[m.model] ?? m.model}</span>
                <span className={styles.modelMeta}>
                  {(m.cost_per_ticket * 1000).toFixed(2)}¢ per 10 ·{" "}
                  {(m.latency_p50 / 1000).toFixed(0)}s
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Policy</legend>
          <label className={styles.rule}>
            <input
              type="checkbox"
              checked={safetyRule}
              onChange={(e) => setSafetyRule(e.target.checked)}
            />
            <span>
              <strong>Safety always reaches a human.</strong> Handbook 5.4, no
              matter how confident the model is.
            </span>
          </label>
          <p className={styles.thresholdReadout}>
            Auto-route above{" "}
            <strong className={styles.thresholdValue}>
              {threshold.toFixed(2)}
            </strong>{" "}
            confidence. Drag the line, or use the arrow keys.
          </p>
        </fieldset>
      </div>

      {/* ---------------------------------------------------------- the field */}
      <div className={styles.stage}>
        <svg
          ref={fieldRef}
          className={styles.field}
          viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
          role="img"
          aria-label={`Twelve evaluation cases for ${SHORT[model.model]}, plotted by the confidence the model reported. ${outcome.escaped.length} wrong answers sit above your threshold of ${threshold.toFixed(2)} and would ship with no human review.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          {/* Bands. The one above the blade is what you are shipping unread. */}
          <rect
            x={PAD_L}
            y={PAD_T}
            width={PLOT_W}
            height={Math.max(0, bladeY - PAD_T)}
            className={styles.bandAuto}
          />
          <rect
            x={PAD_L}
            y={bladeY}
            width={PLOT_W}
            height={Math.max(0, PAD_T + PLOT_H - bladeY)}
            className={styles.bandHuman}
          />

          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={PAD_L + PLOT_W}
                y1={yOf(t)}
                y2={yOf(t)}
                className={styles.grid}
              />
              <text x={PAD_L - 10} y={yOf(t) + 4} className={styles.axisLabel}>
                {t.toFixed(2)}
              </text>
            </g>
          ))}
          <text
            className={styles.axisTitle}
            transform={`translate(16 ${PAD_T + PLOT_H / 2}) rotate(-90)`}
          >
            confidence the model reported
          </text>

          <text
            x={PAD_L + PLOT_W - 8}
            y={PAD_T + 14}
            className={styles.bandLabelEnd}
          >
            ships unread
          </text>
          <text
            x={PAD_L + PLOT_W - 8}
            y={PAD_T + PLOT_H - 8}
            className={styles.bandLabelEnd}
          >
            a person reads it
          </text>

          {placed.map(({ c, x, y }) => {
            const isSafety = c.id === SAFETY_CASE;
            const forced = safetyRule && isSafety;
            const auto = !forced && c.confidence >= threshold;
            const escaping = auto && !c.passed;
            return (
              <g
                key={c.id}
                className={styles.mark}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
                transform={
                  running ? `translate(${auto ? 60 : -60} 0)` : undefined
                }
              >
                {escaping && <circle cx={x} cy={y} r={16} className={styles.alarm} />}
                {c.passed ? (
                  <circle cx={x} cy={y} r={DOT_R} className={styles.dotOk} />
                ) : (
                  /* Wrong answers are a hollow ring with a cross: legible with
                     no colour at all, which the palette check requires. */
                  <g className={styles.dotWrongGroup}>
                    <circle cx={x} cy={y} r={DOT_R} className={styles.dotWrong} />
                    <path
                      d={`M${x - 4.5} ${y - 4.5} L${x + 4.5} ${y + 4.5} M${x + 4.5} ${y - 4.5} L${x - 4.5} ${y + 4.5}`}
                      className={styles.dotCross}
                    />
                  </g>
                )}
                {isSafety && (
                  <>
                    <circle cx={x} cy={y} r={14} className={styles.safetyRing} />
                    <text x={x} y={y + 27} className={styles.safetyLabel}>
                      safety
                    </text>
                  </>
                )}
                {hovered === c.id && (
                  <foreignObject
                    x={Math.min(x + 18, PAD_L + PLOT_W - 250)}
                    y={Math.max(PAD_T, y - 60)}
                    width={250}
                    height={110}
                  >
                    <div className={styles.tip}>
                      <strong>
                        {c.passed ? "Correct" : "Wrong"} · {c.confidence.toFixed(2)}
                      </strong>
                      <span>{noteFor(c.id)}</span>
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* The blade. */}
          <g
            className={styles.blade}
            role="slider"
            tabIndex={0}
            aria-label="Confidence threshold for auto-routing"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={threshold}
            aria-valuetext={`${threshold.toFixed(2)} confidence`}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowRight") {
                e.preventDefault();
                nudge(0.01);
              }
              if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
                e.preventDefault();
                nudge(-0.01);
              }
            }}
          >
            <line
              x1={PAD_L}
              x2={PAD_L + PLOT_W}
              y1={bladeY}
              y2={bladeY}
              className={styles.bladeLine}
            />
            <rect
              x={PAD_L + PLOT_W - 62}
              y={bladeY - 13}
              width={58}
              height={26}
              rx={13}
              className={styles.bladeChip}
            />
            <text
              x={PAD_L + PLOT_W - 33}
              y={bladeY + 5}
              className={styles.bladeChipText}
            >
              {threshold.toFixed(2)}
            </text>
          </g>
        </svg>

        {/* --------------------------------------------------------- readouts */}
        <div className={styles.readouts}>
          <div
            className={
              outcome.escaped.length > 0 ? styles.statBad : styles.statGood
            }
          >
            <span className={styles.statNum}>
              {Math.round(outcome.escapedPerWeek).toLocaleString()}
            </span>
            <span className={styles.statLabel}>
              wrong answers shipped per week, unread
            </span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statNum}>
              {Math.round(outcome.humanHours).toLocaleString()}
            </span>
            <span className={styles.statLabel}>agent hours a week</span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statNum}>{money(outcome.totalCost)}</span>
            <span className={styles.statLabel}>
              a week, all in ({money(outcome.modelCost)} of it the API)
            </span>
          </div>

          <div className={styles.stat}>
            <span className={styles.statNum}>
              {(outcome.autoRate * 100).toFixed(0)}%
            </span>
            <span className={styles.statLabel}>routed without a person</span>
          </div>

          <button type="button" className={styles.run} onClick={run} disabled={running}>
            {running ? "Running the week…" : "Run the week"}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------- the verdict */}
      {ran && (
        <div
          className={
            outcome.safetyEscaped
              ? styles.verdictIncident
              : perfect
                ? styles.verdictGood
                : styles.verdictBad
          }
          role="status"
        >
          {outcome.safetyEscaped ? (
            <>
              <p className={styles.verdictHead}>
                A safety report was auto-routed to the wrong queue.
              </p>
              <p>
                {SHORT[model.model]} classified it wrong and reported{" "}
                <strong>0.95</strong> confidence while doing it. Your threshold
                is <strong>{threshold.toFixed(2)}</strong>, so it sailed through.
                There is no threshold that catches a wrong answer at 0.95 —
                raising it further only sends correct work to people.
              </p>
              <p>
                This is the shape of the October 2025 incident, and it is why
                handbook 5.4 is a category rule rather than a number. Tick{" "}
                <strong>Safety always reaches a human</strong> and run it again.
              </p>
            </>
          ) : perfect ? (
            <>
              <p className={styles.verdictHead}>
                Nothing wrong shipped unread. {money(outcome.totalCost)} a week.
              </p>
              <p>
                {SHORT[model.model]} at {threshold.toFixed(2)}
                {safetyRule ? ", with safety pinned to a human," : ""} caught
                every failure in the eval set and still routed{" "}
                {(outcome.autoRate * 100).toFixed(0)}% without a person.
              </p>
              <p>
                Worth noticing what that cost: the API is{" "}
                {money(outcome.modelCost)} of the {money(outcome.totalCost)}. The
                money is in the agent hours, so the model that lets you route
                more work automatically is the cheap one, whatever its price per
                token says. Try the same threshold on Haiku.
              </p>
            </>
          ) : (
            <>
              <p className={styles.verdictHead}>
                {Math.round(outcome.escapedPerWeek).toLocaleString()} wrong
                answers went out with nobody reading them.
              </p>
              <p>
                {outcome.escaped.length} of the {model.per_case.length} eval
                cases are wrong and sit above {threshold.toFixed(2)}, so the
                safety net never sees them. With {SHORT[model.model]} a wrong
                answer comes back at{" "}
                <strong>{model.calibration.onFail.toFixed(2)}</strong> confidence
                on average against{" "}
                <strong>{model.calibration.onPass.toFixed(2)}</strong> when it is
                right — a gap of{" "}
                <strong>{model.calibration.gap.toFixed(2)}</strong>.
              </p>
              <p>
                That gap is what decides whether a threshold is a control or a
                decoration. Drag the line and watch how much of the queue you
                have to hand back to people before the crosses fall below it.
              </p>
            </>
          )}
        </div>
      )}

      <p className={styles.assumptions}>
        The cases, their pass and fail, the confidence, the cost per ticket and
        the latency are a real eval run —{" "}
        <Link to="/playground/models">the model matrix</Link> is the same data.
        The simulation adds three assumptions and nothing else:{" "}
        {MINUTES_PER_MANUAL_TRIAGE} minutes to triage a ticket by hand,{" "}
        {money(LOADED_HOURLY_RATE)} an hour loaded, and that a 12-case rate holds
        across {WEEK.toLocaleString()} tickets a week. That last one is the
        shakiest and the{" "}
        <Link to="/docs/labs/lab-6-evals">eval lab</Link> is about why.
      </p>
    </div>
  );
}
