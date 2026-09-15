import assert from "node:assert/strict";
import test from "node:test";
import { byokMode, byokSettings } from "./byokConfig";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const set = (entries: [string, string | undefined][]) => {
    for (const [k, v] of entries) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const saved = Object.keys(vars).map((k): [string, string | undefined] => [k, process.env[k]]);
  set(Object.entries(vars));
  try {
    fn();
  } finally {
    set(saved);
  }
}

test("mode is off without GitHub sign-in configured, whatever BYOK_MODE says", () => {
  withEnv({ GITHUB_CLIENT_ID: undefined, GITHUB_CLIENT_SECRET: undefined, BYOK_MODE: "enforce" }, () => {
    assert.equal(byokMode(), "off");
  });
  withEnv({ GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: undefined, BYOK_MODE: "enforce" }, () => {
    assert.equal(byokMode(), "off");
  });
});

test("mode follows BYOK_MODE once sign-in is configured, and anything unknown is off", () => {
  withEnv({ GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" }, () => {
    for (const [value, expected] of [["shadow", "shadow"], ["enforce", "enforce"], ["ENFORCE", "off"], [undefined, "off"]] as const) {
      withEnv({ BYOK_MODE: value }, () => assert.equal(byokMode(), expected));
    }
  });
});

test("settings default to a $2 grant and parse dollars into whole micro-dollars", () => {
  withEnv({ TRIAL_GRANT_USD: undefined, HOUSE_DAILY_BUDGET_USD: "12.345678", SIGNED_IN_IP_MULTIPLIER: "0" }, () => {
    const s = byokSettings();
    assert.equal(s.trialGrantMicros, 2_000_000);
    assert.equal(s.houseBudgetMicros, 12_345_678);
    assert.equal(s.signedInIpMultiplier, 1, "a multiplier below 1 would tighten the window for signed-in users");
  });
  withEnv({ TRIAL_GRANT_USD: "nonsense" }, () => assert.equal(byokSettings().trialGrantMicros, 2_000_000));
});
