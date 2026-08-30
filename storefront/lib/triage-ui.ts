/**
 * Shared visual language for triage fields.
 *
 * One palette across TryClassifier, Support, Queue, Live, and Injection —
 * Pine / Spruce / Ember only. Tailwind red/amber made the same urgency look
 * like two different systems.
 */

export const URGENCY_CHIP: Record<string, string> = {
  urgent: "bg-ember text-bone",
  high: "bg-ember/20 text-ember",
  normal: "bg-pine/12 text-pine",
  low: "bg-pine/8 text-pine/60",
};

export const SENTIMENT_CHIP: Record<string, string> = {
  angry: "bg-ember/20 text-ember",
  frustrated: "bg-ember/12 text-ember",
  neutral: "bg-pine/10 text-pine/70",
  positive: "bg-spruce/20 text-pine",
};

export const CATEGORY_CHIP = "rounded border border-pine/25 bg-white/50 px-2 py-0.5 text-xs font-medium text-pine";

export const HUMAN_CHIP = "rounded bg-pine px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-bone";

export const ERROR_BANNER =
  "rounded-md border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember";

export function urgencyChip(urgency: string): string {
  return `rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
    URGENCY_CHIP[urgency] ?? "bg-pine/10 text-pine/70"
  }`;
}

export function sentimentChip(sentiment: string): string {
  return `rounded px-2 py-0.5 text-xs ${
    SENTIMENT_CHIP[sentiment] ?? "bg-pine/10 text-pine/70"
  }`;
}

export function confidenceBar(confidence: number): string {
  return confidence < 0.6 ? "h-full bg-ember" : "h-full bg-spruce";
}
