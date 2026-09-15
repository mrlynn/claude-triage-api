/**
 * Who pays for a call, as configuration. See docs/byok/SPEC.md §9.
 *
 * Read on every call rather than captured at import, so a test can set the
 * environment and so nothing here needs a server-only boundary.
 */

export type ByokMode = "off" | "shadow" | "enforce";

const num = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
};

const usdToMicros = (usd: number) => Math.round(usd * 1_000_000);

/**
 * `off` unless GitHub sign-in is configured. Without a client id there is no
 * way to identify anyone, so gating would lock every visitor out of every AI
 * feature — local development must stay exactly as it was.
 */
export function byokMode(): ByokMode {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) return "off";
  const mode = process.env.BYOK_MODE;
  return mode === "shadow" || mode === "enforce" ? mode : "off";
}

export function byokSettings() {
  return {
    trialGrantMicros: usdToMicros(num(process.env.TRIAL_GRANT_USD, 2)),
    minAccountAgeDays: num(process.env.TRIAL_MIN_ACCOUNT_AGE_DAYS, 30),
    grantsDaily: num(process.env.TRIAL_GRANTS_DAILY, 200),
    houseBudgetMicros: usdToMicros(num(process.env.HOUSE_DAILY_BUDGET_USD, 50)),
    signedInIpMultiplier: Math.max(1, num(process.env.SIGNED_IN_IP_MULTIPLIER, 3)),
  };
}

/** Sessions last a week; an idle key a day; a user record half a year after they were last seen. */
export const SESSION_TTL_MS = 7 * 86_400_000;
export const KEY_IDLE_TTL_MS = 86_400_000;
export const USER_TTL_MS = 180 * 86_400_000;
