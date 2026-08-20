/**
 * Data behind Priya's operations dashboard.
 *
 * TWO KINDS OF NUMBER LIVE HERE, AND THEY ARE KEPT APART ON PURPOSE.
 *
 *   SIMULATED — the twelve-month operating history. Northwind is a fictional
 *   company; there is no real telemetry and never was. Every series below
 *   marked `simulated` was authored to describe a plausible staged rollout.
 *   The dashboard labels these on the page. A chart that looks like
 *   production telemetry has to say when it isn't, because a screenshot
 *   eventually escapes the page it was on.
 *
 *   MEASURED — numbers that came out of the actual system in this repo:
 *   eval accuracy, per-ticket cost, cache economics, and the category mix
 *   from twenty tickets genuinely run through /v1/triage. These are real and
 *   are badged as such.
 *
 * The rollout arc is staged rather than a big bang, because that is how you
 * would actually ship this: shadow first, then the categories where being
 * wrong is cheap, then the rest. Safety is never fully automated at all.
 */

export type Phase = "baseline" | "shadow" | "partial" | "full";

export interface MonthPoint {
  month: string;
  short: string;
  phase: Phase;
  /** Tickets received that month. */
  volume: number;
  /** Share of tickets a human had to triage by hand, 0–1. */
  humanTriageRate: number;
  /** Median hours to first response. */
  ttfrHours: number;
  /** Share of tickets routed to the wrong queue, 0–1. */
  misroutingRate: number;
  /** Median hours for a safety report to reach the safety queue. */
  safetyQueueHours: number;
  /** Agent hours per week spent triaging rather than resolving. */
  triageHoursPerWeek: number;
}

export const PHASE_LABEL: Record<Phase, string> = {
  baseline: "Manual triage",
  shadow: "Shadow pilot",
  partial: "Partial rollout",
  full: "Full rollout",
};

export const PHASE_NOTE: Record<Phase, string> = {
  baseline: "Every message read and routed by an agent.",
  shadow: "Triage runs on every ticket but routes nothing. Output compared against the agent's decision.",
  partial: "Automated routing for shipping, returns and account only. Billing, defects and safety stay manual.",
  full: "All categories routed automatically. Safety and low-confidence tickets still go to a human by rule.",
};

/** SIMULATED. Twelve months of operating history. */
export const MONTHS: MonthPoint[] = [
  { month: "Jan 2026", short: "Jan", phase: "baseline", volume: 17_800, humanTriageRate: 1.0,  ttfrHours: 13.9, misroutingRate: 0.23, safetyQueueHours: 26.0, triageHoursPerWeek: 171 },
  { month: "Feb 2026", short: "Feb", phase: "baseline", volume: 16_400, humanTriageRate: 1.0,  ttfrHours: 13.1, misroutingRate: 0.24, safetyQueueHours: 24.5, triageHoursPerWeek: 158 },
  { month: "Mar 2026", short: "Mar", phase: "baseline", volume: 18_900, humanTriageRate: 1.0,  ttfrHours: 15.2, misroutingRate: 0.22, safetyQueueHours: 28.1, triageHoursPerWeek: 182 },
  { month: "Apr 2026", short: "Apr", phase: "baseline", volume: 17_200, humanTriageRate: 1.0,  ttfrHours: 14.0, misroutingRate: 0.23, safetyQueueHours: 25.4, triageHoursPerWeek: 165 },

  { month: "May 2026", short: "May", phase: "shadow",   volume: 18_100, humanTriageRate: 1.0,  ttfrHours: 13.6, misroutingRate: 0.22, safetyQueueHours: 24.8, triageHoursPerWeek: 174 },
  { month: "Jun 2026", short: "Jun", phase: "shadow",   volume: 17_600, humanTriageRate: 1.0,  ttfrHours: 13.4, misroutingRate: 0.21, safetyQueueHours: 23.9, triageHoursPerWeek: 169 },

  { month: "Jul 2026", short: "Jul", phase: "partial",  volume: 18_400, humanTriageRate: 0.63, ttfrHours: 9.8,  misroutingRate: 0.15, safetyQueueHours: 11.2, triageHoursPerWeek: 112 },
  { month: "Aug 2026", short: "Aug", phase: "partial",  volume: 19_100, humanTriageRate: 0.58, ttfrHours: 8.4,  misroutingRate: 0.13, safetyQueueHours: 6.4,  triageHoursPerWeek: 104 },

  { month: "Sep 2026", short: "Sep", phase: "full",     volume: 18_700, humanTriageRate: 0.31, ttfrHours: 5.6,  misroutingRate: 0.09, safetyQueueHours: 1.1,  triageHoursPerWeek: 56 },
  { month: "Oct 2026", short: "Oct", phase: "full",     volume: 20_300, humanTriageRate: 0.24, ttfrHours: 4.7,  misroutingRate: 0.08, safetyQueueHours: 0.6,  triageHoursPerWeek: 44 },
  { month: "Nov 2026", short: "Nov", phase: "full",     volume: 41_600, humanTriageRate: 0.22, ttfrHours: 6.9,  misroutingRate: 0.07, safetyQueueHours: 0.5,  triageHoursPerWeek: 79 },
  { month: "Dec 2026", short: "Dec", phase: "full",     volume: 48_900, humanTriageRate: 0.19, ttfrHours: 7.4,  misroutingRate: 0.07, safetyQueueHours: 0.4,  triageHoursPerWeek: 86 },
];

export const BASELINE = MONTHS[3];
export const CURRENT = MONTHS[MONTHS.length - 1];
export const PEAK_BASELINE_TTFR = 41.0;

/**
 * MEASURED. Category mix from the twenty tickets in data/inbound-queue.json,
 * actually run through /v1/triage against claude-opus-5.
 */
export const CATEGORY_MIX: { category: string; count: number; humanRequired: number }[] = [
  { category: "billing", count: 4, humanRequired: 0 },
  { category: "shipping", count: 3, humanRequired: 2 },
  { category: "other", count: 4, humanRequired: 1 },
  { category: "returns", count: 3, humanRequired: 1 },
  { category: "safety", count: 2, humanRequired: 2 },
  { category: "product_defect", count: 2, humanRequired: 1 },
  { category: "account", count: 2, humanRequired: 0 },
];

/** MEASURED. Unit economics from real runs. */
export const ECONOMICS = {
  /**
   * Which model produced the measured figures below. A cost-per-ticket number
   * without a model attached is not a fact — it is a rumour. Rates for this
   * model live in lib/pricing.generated.ts; these numbers are MEASURED
   * observations from real /v1/triage calls and are deliberately NOT
   * recomputed from that table, which is why the badge says "measured".
   */
  model: "claude-opus-5",
  costPerTicketWarm: 0.0053,
  costPerTicketCold: 0.0302,
  cacheSavingPct: 0.82,
  evalAccuracy: 0.917,
  evalCases: 12,
  meanConfidencePasses: 0.85,
  meanConfidenceFailure: 0.5,
  monthlyBudget: 4000,
};

export function monthlyModelSpend(volume: number): number {
  return volume * ECONOMICS.costPerTicketWarm;
}

/** Agent hours returned to resolution work, versus the manual baseline. */
export function hoursReclaimed(point: MonthPoint): number {
  const wouldHaveBeen = (point.volume / BASELINE.volume) * BASELINE.triageHoursPerWeek;
  return Math.max(0, Math.round(wouldHaveBeen - point.triageHoursPerWeek));
}
