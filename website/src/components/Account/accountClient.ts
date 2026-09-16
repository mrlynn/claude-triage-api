/**
 * The browser half of trial credit and BYOK: the shapes `/api/account`
 * returns, and a tiny event bus so any component that calls an AI route can
 * update the meter without knowing the meter exists.
 *
 * WHY EVENTS AND NOT CONTEXT. The callers — the classifier, the support form,
 * the live preview, the injection playground, Ask Northwind — sit in unrelated
 * trees, and the meter lives in the root layout. Threading a provider through
 * all of them to deliver one number would touch every file for no benefit a
 * `CustomEvent` does not already give.
 *
 * The storefront has its own copy (storefront/lib/accountClient.ts). They are
 * duplicated on purpose: sharing React code between Docusaurus and Next means
 * a package, and a package for eighty lines is the wrong size.
 */

export interface Meter {
  mode: "trial" | "exhausted" | "byok";
  trial: { grantUsd: number; spentUsd: number; remainingUsd: number } | null;
  key: { last4: string; sessionSpentUsd: number; limitUsd: number | null; expiresAt: string } | null;
}

export interface Account extends Omit<Meter, "mode"> {
  mode: "off" | "anon" | Meter["mode"];
  enforced: boolean;
  signedIn: boolean;
  login: string | null;
  estimates: Record<string, number>;
  signInPath: string;
}

export interface GateBody {
  error: string;
  detail?: string;
  meter?: Meter;
}

const GATE_CODES = new Set(["sign_in_required", "trial_exhausted", "house_budget", "key_invalid", "key_quota", "key_limit"]);

const METER_EVENT = "nw:meter";
const GATE_EVENT = "nw:gate";

export function publishMeter(meter: Meter): void {
  window.dispatchEvent(new CustomEvent<Meter>(METER_EVENT, { detail: meter }));
}

/** `open: false` for surfaces that must not pop a panel on every keystroke — the live preview. */
export function publishGate(body: GateBody, { open = true }: { open?: boolean } = {}): void {
  window.dispatchEvent(new CustomEvent(GATE_EVENT, { detail: { body, open } }));
}

export function isGateBody(body: unknown): body is GateBody {
  return typeof body === "object" && body !== null && GATE_CODES.has((body as GateBody).error);
}

/**
 * Hand any AI route's JSON body (or an SSE event's data) to this. It updates
 * the meter if the body carries one, and opens the gate if the call was
 * refused for credit, sign-in or a key. Returns true when it was a refusal.
 */
export function reportAi(body: unknown, options?: { open?: boolean }): boolean {
  if (typeof body !== "object" || body === null) return false;
  const meter = (body as { meter?: Meter }).meter;
  if (meter) publishMeter(meter);
  if (isGateBody(body)) {
    publishGate(body, options);
    return true;
  }
  return false;
}

export function onMeter(handler: (meter: Meter) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<Meter>).detail);
  window.addEventListener(METER_EVENT, listener);
  return () => window.removeEventListener(METER_EVENT, listener);
}

export function onGate(handler: (body: GateBody, open: boolean) => void): () => void {
  const listener = (e: Event) => {
    const { body, open } = (e as CustomEvent<{ body: GateBody; open: boolean }>).detail;
    handler(body, open);
  };
  window.addEventListener(GATE_EVENT, listener);
  return () => window.removeEventListener(GATE_EVENT, listener);
}

/** Warnings fire once per threshold per learner, remembered across page loads. */
export const WARN_AT = [0.5, 0.8, 0.95] as const;

export function crossedThreshold(login: string, fractionUsed: number): number | null {
  const crossed = [...WARN_AT].reverse().find((t) => fractionUsed >= t);
  if (crossed === undefined) return null;
  const storageKey = `nw:credit-warned:${login}`;
  try {
    const last = Number(window.localStorage.getItem(storageKey) ?? 0);
    if (crossed <= last) return null;
    window.localStorage.setItem(storageKey, String(crossed));
  } catch {
    // Private windows and blocked storage: warn every time rather than never.
  }
  return crossed;
}

/** "At least" because estimates are worst cases; most calls cost a fraction of one. */
export function atLeast(remainingUsd: number, perCallUsd: number | undefined): number {
  return perCallUsd && perCallUsd > 0 ? Math.floor(remainingUsd / perCallUsd) : 0;
}

/** The limit field suggests this much: about a whole course on the API, with room to spare. */
export const SUGGESTED_LIMIT_USD = 5;

/**
 * What the learner typed in a limit field. Empty means no limit (null); anything else must be a dollar amount the
 * server accepts, or this returns undefined and the form says so before sending anything.
 */
export function parseLimit(text: string): number | null | undefined {
  const trimmed = text.trim().replace(/^\$/, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0.1 && n <= 1_000 ? Math.round(n * 100) / 100 : undefined;
}

export const LIMIT_HINT = "Between $0.10 and $1,000, or leave it empty for no limit.";
