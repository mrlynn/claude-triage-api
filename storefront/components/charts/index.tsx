"use client";

import { useId, useState, type ReactNode } from "react";
import { PALETTE } from "@/lib/palette";

/**
 * Chart primitives for the ops dashboard.
 *
 * Hand-rolled SVG rather than a charting library: the dashboard needs five
 * chart types, all simple, and a library would add weight and take away
 * control of exactly the details that matter here — the 2px surface gap
 * between stacked segments, the direct labels, the phase bands.
 *
 * The palette was validated with the dataviz validator rather than chosen by
 * eye. Categorical is capped at three because a fourth failed all-pairs CVD
 * separation, and the honest fix for that is fewer series, not more hues.
 */


const PAD = { top: 16, right: 16, bottom: 26, left: 40 };

function fmtPct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export function ChartFrame({
  title,
  subtitle,
  badge,
  legend,
  children,
  footnote,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  legend?: { label: string; color: string }[];
  children: ReactNode;
  footnote?: string;
}) {
  return (
    <figure className="m-0 rounded-lg border border-pine/15 bg-white/55 p-4">
      <figcaption className="mb-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-bold">{title}</h3>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-xs leading-relaxed text-pine/60">{subtitle}</p>
        )}
        {legend && legend.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-pine/70">
            {legend.map((l) => (
              <li key={l.label} className="flex list-none items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: l.color }}
                />
                {l.label}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
      {children}
      {footnote && (
        <p className="mt-2 text-[11px] leading-relaxed text-pine/50">{footnote}</p>
      )}
    </figure>
  );
}

export function Badge({ kind }: { kind: "measured" | "simulated" }) {
  const measured = kind === "measured";
  return (
    <span
      className={`rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${
        measured
          ? "bg-[#036A4F] text-white"
          : "border border-pine/25 text-pine/55"
      }`}
      title={
        measured
          ? "Produced by the real system in this repo."
          : "Invented operating history for a fictional company."
      }
    >
      {measured ? "measured" : "simulated"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Line chart with phase bands, a target line, and a crosshair tooltip */
/* ------------------------------------------------------------------ */

export interface LinePoint {
  label: string;
  value: number;
  band?: string;
}

export function LineChart({
  points,
  height = 190,
  format = fmtPct,
  color = PALETTE.categorical[0],
  target,
  targetLabel,
  bands,
  yMax,
  ticks: tickValues,
}: {
  points: LinePoint[];
  height?: number;
  format?: (v: number) => string;
  color?: string;
  target?: number;
  targetLabel?: string;
  bands?: { from: number; to: number; label: string; tone: number }[];
  yMax?: number;
  /** Explicit gridline values. Without these the axis reads as odd
      fractions of a padded maximum, e.g. "110%" or "17h". */
  ticks?: number[];
}) {
  const clip = useId();
  const [hover, setHover] = useState<number | null>(null);
  const w = 560;
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const max = yMax ?? Math.max(...points.map((p) => p.value), target ?? 0) * 1.15;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const ticks = tickValues ?? [0, 0.5, 1].map((t) => max * t);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="w-full"
        role="img"
        onMouseLeave={() => setHover(null)}
      >
        <clipPath id={clip}>
          <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
        </clipPath>

        {bands?.map((b) => (
          <rect
            key={b.label}
            x={x(b.from)}
            y={PAD.top}
            width={x(b.to) - x(b.from)}
            height={innerH}
            fill={PALETTE.sequential[0]}
            opacity={b.tone}
          />
        ))}

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke={PALETTE.grid}
              strokeWidth="1"
            />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill={PALETTE.muted}>
              {format(t)}
            </text>
          </g>
        ))}

        {target !== undefined && (
          <g>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={y(target)}
              y2={y(target)}
              stroke={PALETTE.status.warning}
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            {targetLabel && (
              <text
                x={PAD.left + 4}
                y={y(target) - 5}
                textAnchor="start"
                fontSize="9"
                fontWeight="600"
                fill={PALETTE.status.warning}
              >
                {targetLabel}
              </text>
            )}
          </g>
        )}

        <path d={path} fill="none" stroke={color} strokeWidth="2" clipPath={`url(#${clip})`} />

        {points.map((p, i) => (
          <circle
            key={p.label}
            cx={x(i)}
            cy={y(p.value)}
            r={hover === i ? 5 : 3}
            fill={color}
            stroke={PALETTE.surface}
            strokeWidth="2"
          />
        ))}

        {points.map((p, i) => (
          <rect
            key={`hit-${p.label}`}
            x={x(i) - innerW / (points.length * 2)}
            y={PAD.top}
            width={innerW / points.length}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke={PALETTE.ink}
            strokeWidth="1"
            opacity="0.25"
          />
        )}

        {points.map((p, i) =>
          i % 2 === 0 ? (
            <text
              key={`lbl-${p.label}`}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize="9"
              fill={PALETTE.muted}
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded border border-pine/20 bg-white px-2 py-1 text-[11px] shadow-sm"
          style={{ left: `${(x(hover) / w) * 100}%`, top: 0 }}
        >
          <strong>{points[hover].label}</strong> {format(points[hover].value)}
          {points[hover].band && (
            <span className="block text-pine/55">{points[hover].band}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked column chart                                                */
/* ------------------------------------------------------------------ */

export function StackedBars({
  points,
  height = 190,
  colors,
  seriesLabels,
  formatTotal,
}: {
  points: { label: string; values: [number, number] }[];
  height?: number;
  colors: [string, string];
  seriesLabels: [string, string];
  formatTotal: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 560;
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const max = Math.max(...points.map((p) => p.values[0] + p.values[1])) * 1.1;
  const bw = (innerW / points.length) * 0.62;

  const x = (i: number) => PAD.left + (i + 0.5) * (innerW / points.length) - bw / 2;
  const h = (v: number) => (v / max) * innerH;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" onMouseLeave={() => setHover(null)}>
        <line
          x1={PAD.left}
          x2={w - PAD.right}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke={PALETTE.grid}
        />
        {points.map((p, i) => {
          const hAuto = h(p.values[0]);
          const hHuman = h(p.values[1]);
          const baseY = PAD.top + innerH;
          return (
            <g key={p.label} onMouseEnter={() => setHover(i)} opacity={hover === null || hover === i ? 1 : 0.55}>
              {/* Human-handled sits on the baseline: it is the number Priya
                  is trying to hold flat, so it gets the anchored position. */}
              <rect x={x(i)} y={baseY - hHuman} width={bw} height={hHuman} fill={colors[1]} rx="2" />
              {/* 2px surface gap between segments. */}
              <rect
                x={x(i)}
                y={baseY - hHuman - hAuto}
                width={bw}
                height={Math.max(0, hAuto - 2)}
                fill={colors[0]}
                rx="2"
              />
              <rect x={x(i)} y={PAD.top} width={bw} height={innerH} fill="transparent" />
            </g>
          );
        })}
        {points.map((p, i) =>
          i % 2 === 0 ? (
            <text key={`l-${p.label}`} x={x(i) + bw / 2} y={height - 8} textAnchor="middle" fontSize="9" fill={PALETTE.muted}>
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded border border-pine/20 bg-white px-2 py-1 text-[11px] shadow-sm">
          <strong>{points[hover].label}</strong>
          <span className="block">
            {seriesLabels[0]} {formatTotal(points[hover].values[0])}
          </span>
          <span className="block">
            {seriesLabels[1]} {formatTotal(points[hover].values[1])}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bars, sequential (magnitude)                             */
/* ------------------------------------------------------------------ */

export function HBars({
  rows,
  format,
}: {
  rows: { label: string; value: number; note?: string }[];
  format: (v: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => {
        // Only the first three ramp steps. The two darkest read as black
        // against this cream surface, which flattens the ramp into "bar" and
        // "also bar" — the ordering stops being visible, which is the whole
        // job of a sequential scale.
        const STEPS = 3;
        const shade =
          PALETTE.sequential[
            Math.min(STEPS - 1, Math.floor((r.value / max) * STEPS))
          ];
        return (
          <div key={r.label} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-xs">
            <span className="truncate text-pine/70" title={r.label}>
              {r.label}
            </span>
            <span className="h-4 overflow-hidden rounded-sm bg-pine/8">
              <span
                className="block h-full rounded-sm"
                style={{ width: `${(r.value / max) * 100}%`, background: shade }}
                title={`${r.label}: ${format(r.value)}`}
              />
            </span>
            <span className="text-right font-mono tabular-nums text-pine/70">
              {format(r.value)}
            </span>
            {r.note && (
              <span className="col-span-3 -mt-1 pl-[8rem] text-[10px] text-pine/45">
                {r.note}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */

export function StatTile({
  label,
  value,
  baseline,
  better,
  spark,
  note,
}: {
  label: string;
  value: string;
  baseline: string;
  /** Direction that counts as improvement. */
  better: "down" | "up";
  spark: number[];
  note?: string;
}) {
  const first = spark[0];
  const last = spark[spark.length - 1];
  const improved = better === "down" ? last < first : last > first;
  const max = Math.max(...spark);
  const min = Math.min(...spark);
  const path = spark
    .map((v, i) => {
      const px = (i / (spark.length - 1)) * 100;
      const py = 26 - ((v - min) / (max - min || 1)) * 22;
      return `${i === 0 ? "M" : "L"}${px},${py}`;
    })
    .join(" ");

  return (
    <div className="rounded-lg border border-pine/15 bg-white/55 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/50">
        {label}
      </p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums leading-none">{value}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-[11px] leading-tight text-pine/55">
          was <span className="font-mono">{baseline}</span>
          <br />
          before triage
        </p>
        <svg viewBox="0 0 100 28" className="h-7 w-24" preserveAspectRatio="none" aria-hidden="true">
          <path
            d={path}
            fill="none"
            stroke={improved ? PALETTE.status.good : PALETTE.status.critical}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      {note && <p className="mt-2 text-[11px] leading-relaxed text-pine/50">{note}</p>}
    </div>
  );
}
