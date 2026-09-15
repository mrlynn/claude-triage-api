import { useCallback, useEffect, useState } from "react";
import type { Deck } from "./leitner";
import type { CallMeta, DocRef, DrillItem, Hint, Intake, Lesson, Plan, Review } from "./types";

/**
 * Everything the Tutor remembers lives in this browser, under one versioned
 * key. The storefront stores nothing, so clearing site data is a clean reset —
 * and a private window, or storage that throws, still gets a working page that
 * simply forgets on reload.
 */

const KEY = "tutor:v1";

export type Phase = "warmup" | "brief" | "drill" | "exercise" | "wrap";

export interface SessionProgress {
  phase: Phase;
  /** Epoch ms the countdown hits zero. Absent while paused. */
  deadline?: number;
  /** Remaining ms, recorded when paused. */
  remaining?: number;
  timeUp?: boolean;
  /** Due cards, fixed when the session starts so answering does not reshuffle them. */
  warmup: { items: DrillItem[]; answers: Record<number, number> };
  drill: Record<number, number>;
  attempts: { text: string; review?: Review; meta?: CallMeta }[];
  draft: string;
  /** Optional so progress saved before hints existed still loads. */
  hints?: { hint: Hint; meta: CallMeta }[];
  done?: boolean;
}

export interface TutorState {
  intake: Intake | null;
  plan: Plan | null;
  planMeta: CallMeta | null;
  docs: DocRef[];
  lessons: Record<number, { lesson: Lesson; meta: CallMeta }>;
  progress: Record<number, SessionProgress>;
  deck: Deck;
  /** Session currently open in the runner, if any. */
  active: number | null;
}

export const EMPTY: TutorState = {
  intake: null,
  plan: null,
  planMeta: null,
  docs: [],
  lessons: {},
  progress: {},
  deck: {},
  active: null,
};

/** A session with a starter opens its editor on the starter, not on a blank page. */
export function newProgress(warmup: DrillItem[], starterCode = ""): SessionProgress {
  return {
    phase: warmup.length ? "warmup" : "brief",
    warmup: { items: warmup, answers: {} },
    drill: {},
    attempts: [],
    draft: starterCode,
  };
}

function load(): TutorState {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<TutorState>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(state: TutorState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable or full: the page keeps working, it just forgets */
  }
}

/**
 * State that persists. Loads after mount, because the page is prerendered and
 * `window` does not exist at build time; `ready` is false until then so the
 * page does not flash the intake form at someone halfway through a plan.
 */
export function useTutorState() {
  const [state, setState] = useState<TutorState>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) save(state);
  }, [ready, state]);

  const update = useCallback((fn: (s: TutorState) => TutorState) => setState(fn), []);
  const reset = useCallback(() => setState(EMPTY), []);

  return { state, ready, update, reset };
}
