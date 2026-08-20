import { useMemo, useState, type ReactNode } from "react";
import styles from "./styles.module.css";

/**
 * Interactive cost model for the triage service.
 *
 * Every constant here is either Claude Opus 5 list pricing or a number
 * measured from an actual run of this repo, so the output is a real estimate
 * rather than an illustration. The point of the component is to make one
 * specific thing physical: the cached prefix is most of the input on every
 * request, and whether you cache it decides whether the project fits Priya's
 * $4,000 budget.
 */

/**
 * Mirrors MODEL_CATALOG in src/config.ts, which is the canonical table.
 * This file is a static playground component and cannot import from the API
 * package, so the rows are duplicated here on purpose — check them against
 * src/config.ts when either moves. Lab 7 adds the model selector that makes
 * the extra rows reachable from the UI.
 *
 * Sonnet 5 is listed at LIST price ($3/$15). Its introductory rate expires,
 * and a budget built on a promotion breaks the day it does.
 */
const PRICING_BY_MODEL = {
  "claude-opus-5": {
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
  "claude-sonnet-5": {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
  "claude-haiku-4-5": {
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
} as const;

type ModelKey = keyof typeof PRICING_BY_MODEL;

/** The token counts below were measured on this model. */
const MEASURED_ON: ModelKey = "claude-opus-5";

/** Measured against claude-opus-5 with this repo's prompts. */
const MEASURED = {
  cachedPrefixTokens: 3358,
  variableInputTokens: 112,
  triageOutputTokens: 134,
  resolveOutputTokens: 520,
  resolveTurns: 3,
  draftOutputTokens: 386,
};

type RouteKey = "triage" | "resolve" | "draft";

const ROUTES: Record<
  RouteKey,
  { label: string; blurb: string; outputTokens: number; turns: number }
> = {
  triage: {
    label: "/v1/triage",
    blurb: "One call. Classify and route.",
    outputTokens: MEASURED.triageOutputTokens,
    turns: 1,
  },
  resolve: {
    label: "/v1/resolve",
    blurb: "Agentic loop. History grows every turn.",
    outputTokens: MEASURED.resolveOutputTokens,
    turns: MEASURED.resolveTurns,
  },
  draft: {
    label: "/v1/draft",
    blurb: "Streamed reply for an agent to send.",
    outputTokens: MEASURED.draftOutputTokens,
    turns: 1,
  },
};

const VOLUME_PRESETS = [
  { label: "Quiet week", value: 4_100 * 4, note: "4,100/wk" },
  { label: "Peak month", value: 45_000, note: "11,300/wk" },
  { label: "10x growth", value: 450_000, note: "someday" },
];

const MONTHLY_BUDGET = 4000;

function usd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(5)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * An agentic loop resends the whole conversation each turn, so input grows
 * roughly triangularly with turn count rather than linearly. Turn k pays for
 * the prefix plus k units of accumulated variable content.
 */
function costOnce(route: RouteKey, cached: boolean, model: ModelKey) {
  const { outputTokens, turns } = ROUTES[route];
  const pricing = PRICING_BY_MODEL[model];
  const inRate = pricing.inputPerMTok / 1_000_000;
  const outRate = pricing.outputPerMTok / 1_000_000;

  let prefixCost = 0;
  let variableCost = 0;

  for (let turn = 1; turn <= turns; turn++) {
    const isFirstTurn = turn === 1;
    const prefixRate = cached
      ? isFirstTurn
        ? inRate * pricing.cacheWriteMultiplier
        : inRate * pricing.cacheReadMultiplier
      : inRate;

    prefixCost += MEASURED.cachedPrefixTokens * prefixRate;
    variableCost += MEASURED.variableInputTokens * turn * inRate;
  }

  const outputCost = outputTokens * outRate;
  return {
    prefix: prefixCost,
    variable: variableCost,
    output: outputCost,
    total: prefixCost + variableCost + outputCost,
  };
}

function Bar({
  segments,
  max,
}: {
  segments: { label: string; value: number; color: string }[];
  max: number;
}) {
  return (
    <div className={styles.bar} role="img" aria-label="cost breakdown">
      {segments.map((s) => (
        <div
          key={s.label}
          className={styles.barSegment}
          style={{
            width: `${max > 0 ? (s.value / max) * 100 : 0}%`,
            background: s.color,
          }}
          title={`${s.label}: ${usd(s.value)}`}
        />
      ))}
    </div>
  );
}

export default function CostExplorer(): ReactNode {
  const [route, setRoute] = useState<RouteKey>("triage");
  const [volume, setVolume] = useState(45_000);
  const [cached, setCached] = useState(true);
  const [model, setModel] = useState<ModelKey>(MEASURED_ON);

  const warm = useMemo(() => costOnce(route, true, model), [route, model]);
  const cold = useMemo(() => costOnce(route, false, model), [route, model]);
  const active = cached ? warm : cold;

  const monthly = active.total * volume;
  const monthlyOther = (cached ? cold : warm).total * volume;
  const overBudget = monthly > MONTHLY_BUDGET;
  const budgetPct = Math.min((monthly / MONTHLY_BUDGET) * 100, 100);

  const maxSegment = Math.max(warm.total, cold.total);

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <fieldset className={styles.field}>
          <legend>Route</legend>
          <div className={styles.segmented}>
            {(Object.keys(ROUTES) as RouteKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={route === key ? styles.segActive : styles.seg}
                onClick={() => setRoute(key)}
              >
                {ROUTES[key].label}
              </button>
            ))}
          </div>
          <p className={styles.hint}>{ROUTES[route].blurb}</p>
        </fieldset>

        <fieldset className={styles.field}>
          <legend>Model</legend>
          <div className={styles.segmented}>
            {(Object.keys(PRICING_BY_MODEL) as ModelKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={model === key ? styles.segActive : styles.seg}
                onClick={() => setModel(key)}
              >
                {key.replace("claude-", "")}
              </button>
            ))}
          </div>
          <p className={styles.hint}>
            {model === MEASURED_ON ? (
              <>Token counts were measured on this model.</>
            ) : (
              <>
                Prices are this model&rsquo;s; the token counts are still the ones
                measured on {MEASURED_ON.replace("claude-", "")}. Close enough for
                a budget, and the accuracy difference is the part this widget
                cannot show you &mdash; see the model matrix.
              </>
            )}
          </p>
        </fieldset>

        <fieldset className={styles.field}>
          <legend>Monthly tickets</legend>
          <input
            className={styles.slider}
            type="range"
            min={1000}
            max={450000}
            step={1000}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="monthly ticket volume"
          />
          <div className={styles.presets}>
            {VOLUME_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={volume === p.value ? styles.chipActive : styles.chip}
                onClick={() => setVolume(p.value)}
              >
                {p.label}
                <span className={styles.chipNote}>{p.note}</span>
              </button>
            ))}
          </div>
          <p className={styles.hint}>
            {volume.toLocaleString()} tickets a month
          </p>
        </fieldset>

        <fieldset className={styles.field}>
          <legend>Prompt caching</legend>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={cached}
              onChange={(e) => setCached(e.target.checked)}
            />
            <span>{cached ? "On" : "Off"}</span>
          </label>
          <p className={styles.hint}>
            The {MEASURED.cachedPrefixTokens.toLocaleString()}-token prefix is
            role instructions plus the full policy handbook.
          </p>
        </fieldset>
      </div>

      <div className={styles.readout}>
        <div className={styles.headline}>
          <div>
            <div className={styles.headlineLabel}>Per request</div>
            <div className={styles.headlineValue}>{usd(active.total)}</div>
          </div>
          <div>
            <div className={styles.headlineLabel}>Per month</div>
            <div
              className={
                overBudget ? styles.headlineValueBad : styles.headlineValueGood
              }
            >
              {usd(monthly)}
            </div>
          </div>
          <div>
            <div className={styles.headlineLabel}>
              {cached ? "Without caching" : "With caching"}
            </div>
            <div className={styles.headlineAlt}>{usd(monthlyOther)}</div>
          </div>
        </div>

        <div className={styles.budget}>
          <div className={styles.budgetTrack}>
            <div
              className={overBudget ? styles.budgetFillBad : styles.budgetFill}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className={styles.budgetNote}>
            {overBudget ? (
              <>
                <strong>Over budget.</strong> Priya has {usd(MONTHLY_BUDGET)} a
                month. This is {(monthly / MONTHLY_BUDGET).toFixed(1)}x that.
              </>
            ) : (
              <>
                Inside the {usd(MONTHLY_BUDGET)} monthly budget, at{" "}
                {((monthly / MONTHLY_BUDGET) * 100).toFixed(0)}% of it.
              </>
            )}
          </p>
        </div>

        <div className={styles.breakdown}>
          <div className={styles.breakdownHeader}>
            Where the money goes, per request
          </div>
          <Bar
            max={maxSegment}
            segments={[
              {
                label: "Cached prefix",
                value: active.prefix,
                color: "var(--ifm-color-primary)",
              },
              {
                label: "Variable input",
                value: active.variable,
                color: "var(--ifm-color-primary-lighter)",
              },
              {
                label: "Output",
                value: active.output,
                color: "var(--ifm-color-warning)",
              },
            ]}
          />
          <ul className={styles.legend}>
            <li>
              <span
                className={styles.swatch}
                style={{ background: "var(--ifm-color-primary)" }}
              />
              Prefix (handbook + role) {usd(active.prefix)}
            </li>
            <li>
              <span
                className={styles.swatch}
                style={{ background: "var(--ifm-color-primary-lighter)" }}
              />
              Variable input {usd(active.variable)}
            </li>
            <li>
              <span
                className={styles.swatch}
                style={{ background: "var(--ifm-color-warning)" }}
              />
              Output {usd(active.output)}
            </li>
          </ul>
        </div>

        <p className={styles.insight}>
          {cached ? (
            <>
              Caching moves the prefix from full rate to{" "}
              {PRICING_BY_MODEL[model].cacheReadMultiplier}x on every request after the first.
              Turn caching off and watch the blue segment take over the bar.
            </>
          ) : (
            <>
              Without caching, the prefix is paid at full rate on every single
              request. It is the largest single line item and it is identical
              every time.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
