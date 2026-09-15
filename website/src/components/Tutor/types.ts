/**
 * HAND-MIRRORED from `storefront/lib/tutorPolicy.ts`, which carries the rules
 * these shapes obey. The site and the storefront build from separate roots and
 * cannot import across them. Change both.
 */

export type Level = "new" | "some" | "shipped";

export interface Intake {
  days: number;
  sessionsPerDay: number;
  minutesPerSession: number;
  level: Level;
  focus: string[];
}

export interface QuizItem {
  question: string;
  options: string[];
  answer: number;
  explain: string;
  note?: string;
}

export interface DrillItem extends QuizItem {
  labId: string;
  source: "authored" | "generated";
}

export interface PlanSession {
  n: number;
  title: string;
  minutes: number;
  day: number;
  labIds: string[];
  objectives: string[];
  whyNow: string;
}

export interface Plan {
  goal: string;
  doneMeans: string[];
  gaps: string[];
  sessions: PlanSession[];
}

/** A planted mistake, by id. The storefront knows what each id means; this page does not need to. */
export interface StarterDefect {
  mistakeId: string;
  criterion: number;
}

/** Code the exercise editor opens with: it runs, and it is wrong in the ways `defects` name. */
export interface Starter {
  code: string;
  defects: StarterDefect[];
}

export interface Lesson {
  sessionN: number;
  title: string;
  brief: { point: string; labId: string }[];
  drill: DrillItem[];
  exercise: { prompt: string; deliverable: string; rubric: string[] };
  /** Null when the exercise starts blank. Absent on lessons saved before starters existed. */
  starter?: Starter | null;
}

/** "missing": not addressed. "incorrect": addressed and wrong. */
export type Gap = "missing" | "incorrect";

export interface Review {
  verdict: "pass" | "revise";
  /** Optional, like `gap`: reviews saved before these existed still load. */
  rightSoFar?: string;
  rubric: { criterion: string; met: boolean; gap?: Gap | null; note: string }[];
  fixes: { issue: string; why: string; labRef: string | null }[];
  beforeNextLesson: string;
}

/** 1 nudge (the idea), 2 pointer (the field or method), 3 step (the shape of one piece). */
export type HintLevel = 1 | 2 | 3;

export interface Hint {
  level: HintLevel;
  text: string;
  labRef: string | null;
  lookFor: string | null;
}

export interface CallMeta {
  model: string;
  costUsd: number;
  cacheReadTokens: number;
  dropped: string[];
}

export interface DocRef {
  id: string;
  title: string;
  path: string;
  time: string | null;
}

/** Same ceilings the storefront enforces; mirrored so the form cannot ask for more. */
export const LIMITS = {
  maxDays: 30,
  maxSessionsPerDay: 3,
  maxSessions: 14,
  maxAttemptChars: 6_000,
  maxHints: 3,
  maxQuestionChars: 500,
} as const;

export function sessionCount(intake: Pick<Intake, "days" | "sessionsPerDay">): number {
  return Math.min(LIMITS.maxSessions, Math.max(1, Math.round(intake.days * intake.sessionsPerDay)));
}

/**
 * The focus picker. Ids must match `storefront/data/tutor-corpus.json`; the
 * storefront drops any it does not know, so a stale entry here narrows nothing
 * rather than inventing a topic.
 */
export const TOPICS: { id: string; label: string }[] = [
  { id: "lab-1", label: "First call: content, usage, stop_reason" },
  { id: "lab-2", label: "Structured outputs" },
  { id: "lab-3", label: "Tool use and the agentic loop" },
  { id: "lab-4", label: "Streaming and SSE" },
  { id: "lab-5", label: "Prompt caching and cost" },
  { id: "lab-6", label: "Evals and LLM-as-judge" },
  { id: "lab-7", label: "Choosing a model" },
  { id: "lab-8", label: "Trust boundary and injection" },
  { id: "lab-9", label: "Shipping: batches, rate limits, MCP" },
];
