"use client";
import { LABS_URL, labs } from "@/lib/links";

import Link from "next/link";
import {
  MONTHS,
  BASELINE,
  CURRENT,
  PEAK_BASELINE_TTFR,
  PHASE_LABEL,
  PHASE_NOTE,
  CATEGORY_MIX,
  ECONOMICS,
  monthlyModelSpend,
  hoursReclaimed,
} from "@/lib/opsData";
import {
  ChartFrame,
  PlotScroll,
  Badge,
  LineChart,
  StackedBars,
  HBars,
  StatTile,
} from "@/components/charts";
import { PALETTE } from "@/lib/palette";

/**
 * The dashboard is a Client Component because the charts take formatter
 * functions as props, and a Server Component cannot pass a function across
 * the boundary. page.tsx stays a server file so it can still export metadata.
 */

const pct = (v: number) => `${Math.round(v * 100)}%`;
const hrs = (v: number) => `${v.toFixed(1)}h`;
const k = (v: number) => `${(v / 1000).toFixed(1)}k`;

export default function OpsDashboard() {
  const phaseBands = [
    { from: 4, to: 6, label: "shadow", tone: 0.1 },
    { from: 6, to: 8, label: "partial", tone: 0.18 },
    { from: 8, to: MONTHS.length - 1, label: "full", tone: 0.26 },
  ];

  const reclaimed = hoursReclaimed(CURRENT);
  const spend = monthlyModelSpend(CURRENT.volume);

  return (
    <>
      {/* The honesty banner. Non-dismissable and above the fold on purpose. */}
      <div className="mb-6 rounded-lg border-l-4 border-[#B5761A] bg-[#FBF3E4] p-4 text-sm leading-relaxed">
        <p className="font-bold">This dashboard is a teaching artefact, not a record.</p>
        <p className="mt-1 text-pine/75">
          Northwind Outfitters is a fictional company. The twelve-month
          operating history below was <strong>invented</strong> to describe a
          plausible staged rollout, and every chart drawn from it is badged{" "}
          <span className="rounded border border-pine/25 px-1 py-px text-[10px] font-bold uppercase tracking-wide">
            simulated
          </span>
          . A few numbers are real &mdash; eval accuracy, per-ticket cost, cache
          economics and the category mix &mdash; and those are badged{" "}
          <span className="rounded bg-[#036A4F] px-1 py-px text-[10px] font-bold uppercase tracking-wide text-white">
            measured
          </span>
          , meaning they came out of the actual system.
        </p>
      </div>

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-spruce">
          Internal &middot; Support Operations
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          Triage programme review
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-pine/75">
          Prepared for Priya Raman, Director of Support. Twelve months to
          December 2026, covering the staged rollout of automated triage from
          shadow pilot through full deployment.
        </p>
      </header>

      {/* KPI row — Priya's four numbers, the ones she reports upward. */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Tickets triaged by hand"
          value={pct(CURRENT.humanTriageRate)}
          baseline={pct(BASELINE.humanTriageRate)}
          better="down"
          spark={MONTHS.map((m) => m.humanTriageRate)}
          note="Safety and low-confidence tickets are still routed to a person by rule, so this floor is deliberate."
        />
        <StatTile
          label="Median first response"
          value={hrs(CURRENT.ttfrHours)}
          baseline={hrs(BASELINE.ttfrHours)}
          better="down"
          spark={MONTHS.map((m) => m.ttfrHours)}
          note={`December peak. Last year's December ran at ${PEAK_BASELINE_TTFR}h on less than half the volume.`}
        />
        <StatTile
          label="Mis-routing rate"
          value={pct(CURRENT.misroutingRate)}
          baseline={pct(BASELINE.misroutingRate)}
          better="down"
          spark={MONTHS.map((m) => m.misroutingRate)}
          note="Every mis-route costs a re-read and a re-queue."
        />
        <StatTile
          label="Safety time to queue"
          value={`${(CURRENT.safetyQueueHours * 60).toFixed(0)}m`}
          baseline={hrs(BASELINE.safetyQueueHours)}
          better="down"
          spark={MONTHS.map((m) => m.safetyQueueHours)}
          note="Clause 5.4 sets a one-hour ceiling with zero tolerance."
        />
      </section>

      {/* The chart the whole programme is judged on. Emphasis form: one
          series, phase bands for context, no competing colours. */}
      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <ChartFrame
          title="Tickets a human had to triage"
          badge={<Badge kind="simulated" />}
          subtitle="The number this programme exists to move. Shaded bands mark each rollout phase."
          footnote="It does not go to zero, and it should not. Safety reports and anything below the confidence threshold route to a person by rule."
        >
          <PlotScroll>
            <LineChart
              points={MONTHS.map((m) => ({
                label: m.short,
                value: m.humanTriageRate,
                band: PHASE_LABEL[m.phase],
              }))}
              bands={phaseBands}
              format={pct}
              yMax={1.12}
              ticks={[0, 0.5, 1]}
            />
          </PlotScroll>
        </ChartFrame>

        <ChartFrame
          title="Volume, and who handled it"
          badge={<Badge kind="simulated" />}
          subtitle="December volume more than doubled. The human-handled band barely moved."
          legend={[
            { label: "Routed automatically", color: PALETTE.categorical[0] },
            { label: "Handled by an agent", color: PALETTE.categorical[2] },
          ]}
          footnote="This is the chart to show a CFO. Peak season used to mean seasonal hires and a 41-hour response time; the load that reaches a person is now roughly flat against volume."
        >
          <PlotScroll>
            <StackedBars
              points={MONTHS.map((m) => ({
                label: m.short,
                values: [
                  Math.round(m.volume * (1 - m.humanTriageRate)),
                  Math.round(m.volume * m.humanTriageRate),
                ] as [number, number],
              }))}
              colors={[PALETTE.categorical[0], PALETTE.categorical[2]]}
              seriesLabels={["Routed automatically", "Handled by an agent"]}
              formatTotal={k}
            />
          </PlotScroll>
        </ChartFrame>

        <ChartFrame
          title="Median time to first response"
          badge={<Badge kind="simulated" />}
          subtitle="Hours. The November and December rise is peak volume, not regression."
          footnote="Triage overhead was the removable part of this number. What remains is the time to actually resolve things."
        >
          <PlotScroll>
            <LineChart
              points={MONTHS.map((m) => ({ label: m.short, value: m.ttfrHours, band: PHASE_LABEL[m.phase] }))}
              bands={phaseBands}
              format={(v) => `${v.toFixed(0)}h`}
              color={PALETTE.categorical[1]}
              yMax={18}
              ticks={[0, 5, 10, 15]}
            />
          </PlotScroll>
        </ChartFrame>

        <ChartFrame
          title="Safety reports: time to reach the safety queue"
          badge={<Badge kind="simulated" />}
          subtitle="Hours, against the one-hour ceiling in handbook clause 5.4."
          footnote="The October 2025 incident sat for three days. This is the metric that exists because of it, and the only one with zero tolerance."
        >
          <PlotScroll>
            <LineChart
              points={MONTHS.map((m) => ({ label: m.short, value: m.safetyQueueHours, band: PHASE_LABEL[m.phase] }))}
              bands={phaseBands}
              format={(v) => `${v.toFixed(0)}h`}
              color={PALETTE.status.critical}
              target={1}
              targetLabel="1h ceiling (clause 5.4)"
              yMax={30}
              ticks={[0, 10, 20, 30]}
            />
          </PlotScroll>
        </ChartFrame>
      </section>

      {/* Real numbers. Separated visually and by section heading. */}
      <section className="mt-10">
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="text-lg font-bold">From the live system</h2>
          <Badge kind="measured" />
        </div>
        <p className="mb-5 max-w-2xl text-sm leading-relaxed text-pine/70">
          Everything above this line is invented. Everything below came out of
          the triage service itself &mdash; the same code path the{" "}
          <Link href="/support" className="underline underline-offset-2">
            support form
          </Link>{" "}
          runs.
        </p>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartFrame
            title="Category mix"
            badge={<Badge kind="measured" />}
            subtitle="Twenty real tickets run through /v1/triage against claude-opus-5."
            footnote="Seven categories is past the point where colour can carry identity, so this is a magnitude chart in one hue with the values labelled directly."
          >
            <HBars
              rows={[...CATEGORY_MIX]
                .sort((a, b) => b.count - a.count)
                .map((c) => ({
                  label: c.category,
                  value: c.count,
                  note:
                    c.humanRequired > 0
                      ? `${c.humanRequired} of ${c.count} flagged for a human`
                      : undefined,
                }))}
              format={(v) => String(v)}
            />
          </ChartFrame>

          <div className="grid min-w-0 gap-5">
            <ChartFrame
              title="Unit economics"
              badge={<Badge kind="measured" />}
              subtitle="Per ticket, measured against list pricing."
            >
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Metric label="Warm cache" value={`$${ECONOMICS.costPerTicketWarm.toFixed(4)}`} />
                <Metric label="Cold cache" value={`$${ECONOMICS.costPerTicketCold.toFixed(4)}`} />
                <Metric label="Saved by caching" value={pct(ECONOMICS.cacheSavingPct)} />
                <Metric
                  label="December model spend"
                  value={`$${spend.toFixed(0)}`}
                  note={`of a $${ECONOMICS.monthlyBudget.toLocaleString()} budget`}
                />
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-pine/50">
                Without prompt caching the same December volume would cost about
                ${(CURRENT.volume * ECONOMICS.costPerTicketCold).toFixed(0)}, which
                is over budget on its own.
              </p>
            </ChartFrame>

            <ChartFrame
              title="Is the confidence score trustworthy?"
              badge={<Badge kind="measured" />}
              subtitle={`${Math.round(ECONOMICS.evalAccuracy * 100)}% on a ${ECONOMICS.evalCases}-case gold set.`}
              footnote="What matters is the gap, not the accuracy. Wrong answers score lower than right ones, which is what makes threshold routing safe to build on."
            >
              <HBars
                rows={[
                  { label: "on correct", value: ECONOMICS.meanConfidencePasses },
                  { label: "on incorrect", value: ECONOMICS.meanConfidenceFailure },
                ]}
                format={(v) => v.toFixed(2)}
              />
            </ChartFrame>
          </div>
        </div>
      </section>

      {/* Rollout narrative — the thing a leadership team actually asks about. */}
      <section className="mt-10 rounded-lg border border-pine/15 bg-white/40 p-5">
        <h2 className="text-lg font-bold">How it was rolled out</h2>
        <p className="mt-1 max-w-2xl text-sm text-pine/70">
          Staged rather than switched on. Each phase had a way to be wrong that
          did not cost a customer anything.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["baseline", "shadow", "partial", "full"] as const).map((phase, i) => (
            <li key={phase} className="rounded-md border border-pine/15 bg-white/60 p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-pine text-[10px] font-bold text-bone">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold">{PHASE_LABEL[phase]}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-pine/65">
                {PHASE_NOTE[phase]}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm leading-relaxed text-pine/70">
          Agent hours returned to resolution work in December:{" "}
          <strong>{reclaimed} hours a week</strong> against what the same volume
          would have cost under manual triage. That is the number Priya reports
          upward, and it is the one that pays for the programme.
        </p>
      </section>

      <p className="mt-8 text-sm text-pine/65">
        The system behind these numbers is documented at{" "}
        <a
          href={LABS_URL}
          className="underline underline-offset-2"
        >
          the Claude API triage labs
        </a>
        . For who Priya is and why these four metrics,{" "}
        <a
          href={labs("/docs/scenario")}
          className="underline underline-offset-2"
        >
          read the scenario
        </a>
        .
      </p>
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-pine/50">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular-nums">{value}</dd>
      {note && <p className="text-[11px] text-pine/50">{note}</p>}
    </div>
  );
}
