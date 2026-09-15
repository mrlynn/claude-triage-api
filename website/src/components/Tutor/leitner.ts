import type { DrillItem } from "./types";

/**
 * Spaced repetition, the smallest version that works: three Leitner boxes.
 *
 *   box 1  missed recently   — due every session
 *   box 2  right once        — due every second session
 *   box 3  right twice+      — due every fourth session
 *
 * A miss sends a card back to box 1 wherever it was. That is the whole
 * mechanism: what you get wrong comes back until you stop getting it wrong,
 * and what you know stops costing you minutes you do not have.
 */

export interface Card {
  item: DrillItem;
  box: 1 | 2 | 3;
  /** The session this card was last answered in. */
  seen: number;
}

export type Deck = Record<string, Card>;

const INTERVAL: Record<Card["box"], number> = { 1: 1, 2: 2, 3: 4 };

export function cardKey(item: Pick<DrillItem, "question">): string {
  return item.question.trim().toLowerCase();
}

export function record(deck: Deck, item: DrillItem, correct: boolean, session: number): Deck {
  const key = cardKey(item);
  const current = deck[key];
  const box: Card["box"] = correct ? (current ? (Math.min(3, current.box + 1) as Card["box"]) : 2) : 1;
  return { ...deck, [key]: { item, box, seen: session } };
}

/** Queue without scoring: time ran out before the learner reached it. */
export function queue(deck: Deck, item: DrillItem, session: number): Deck {
  const key = cardKey(item);
  return deck[key] ? deck : { ...deck, [key]: { item, box: 1, seen: session - 1 } };
}

/** Cards due at the start of `session`, weakest first, excluding this session's own drill. */
export function due(deck: Deck, session: number, exclude: readonly DrillItem[], limit = 5): Card[] {
  const skip = new Set(exclude.map(cardKey));
  return Object.entries(deck)
    .filter(([key, card]) => !skip.has(key) && card.seen < session && session - card.seen >= INTERVAL[card.box])
    .map(([, card]) => card)
    .sort((a, b) => a.box - b.box || a.seen - b.seen)
    .slice(0, limit);
}

/** Lab ids behind the cards still in box 1 — sent to the next lesson as weak spots. */
export function weakSpots(deck: Deck): string[] {
  return [...new Set(Object.values(deck).filter((c) => c.box === 1).map((c) => c.item.labId))];
}
