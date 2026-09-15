"use client";

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import {
  atLeast,
  crossedThreshold,
  onGate,
  onMeter,
  type Account,
  type GateBody,
} from "@/lib/accountClient";

/**
 * The credit meter: a pill in the corner, a panel when opened.
 *
 * Renders nothing while BYOK_MODE is off, so a deployment without GitHub
 * sign-in configured looks exactly as it did. The server enforces every rule
 * shown here; this is the explanation, not the lock.
 */

const SIGNIN_NOTICE: Record<string, string> = {
  ok: "Signed in. Your free credit is ready.",
  failed: "Sign-in did not complete. Try again.",
  cancelled: "Sign-in was cancelled.",
};

function formatUsd(usd: number): string {
  return usd < 0.1 && usd > 0 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}

/** Null when the account cannot be read: a meter that cannot load is a missing pill, not a broken page. */
async function fetchAccount(api: string): Promise<Account | null> {
  try {
    const res = await fetch(`${api}/api/account`, { credentials: "include", cache: "no-store" });
    return res.ok ? ((await res.json()) as Account) : null;
  } catch {
    return null;
  }
}

export default function AccountMeter({ api = "" }: { api?: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  // Event handlers read the latest account from here, so a state updater never has to carry side effects.
  const current = useRef<Account | null>(null);
  useEffect(() => {
    current.current = account;
  }, [account]);

  const refresh = useCallback(async () => {
    const next = await fetchAccount(api);
    if (next) setAccount(next);
  }, [api]);

  useEffect(() => {
    // Back from GitHub: say what happened once, then take the flag out of the URL.
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("signin");
    if (flag) {
      url.searchParams.delete("signin");
      window.history.replaceState(window.history.state, "", url.toString());
    }
    void fetchAccount(api).then((next) => {
      if (next) setAccount(next);
      if (flag) {
        setNotice(SIGNIN_NOTICE[flag] ?? null);
        setOpen(true);
      }
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [api, refresh]);

  useEffect(() => {
    const offMeter = onMeter((meter) => {
      const prev = current.current;
      if (!prev || !prev.signedIn) {
        void refresh();
        return;
      }
      setAccount({ ...prev, ...meter });
      if (meter.mode !== "byok" && meter.trial && prev.login && meter.trial.grantUsd > 0) {
        const crossed = crossedThreshold(prev.login, meter.trial.spentUsd / meter.trial.grantUsd);
        if (crossed !== null) {
          setNotice(
            `You have used ${Math.round(crossed * 100)}% of your free credit. Add your own key any time to keep going without a limit.`,
          );
        }
      }
    });
    const offGate = onGate((body: GateBody, shouldOpen) => {
      setNotice(body.detail ?? null);
      if (body.error === "trial_exhausted" || body.error === "key_invalid" || body.error === "house_budget") setKeyOpen(true);
      if (shouldOpen) setOpen(true);
      void refresh();
    });
    return () => {
      offMeter();
      offGate();
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (!account || account.mode === "off") return null;

  function signIn() {
    const back = new URL(window.location.href);
    back.searchParams.delete("signin");
    // A full navigation to an API route that redirects to GitHub, not a client-side page change.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${api}${account!.signInPath}?returnTo=${encodeURIComponent(back.toString())}`;
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch(`${api}/api/auth/signout`, { method: "POST", credentials: "include" });
    } finally {
      setBusy(false);
      setNotice(null);
      setKeyOpen(false);
      await refresh();
    }
  }

  async function saveKey(e: SyntheticEvent) {
    e.preventDefault();
    setBusy(true);
    setKeyError(null);
    // Out of React state the moment it is sent. Nothing on the page holds it after this.
    const apiKey = keyInput.trim();
    setKeyInput("");
    try {
      const res = await fetch(`${api}/api/account/key`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setKeyError(body?.detail ?? "That key could not be saved.");
        return;
      }
      setAccount(body as Account);
      setKeyOpen(false);
      setNotice("Your key is in use. It is encrypted, used only for your requests, and forgotten after 24 hours unused.");
    } catch {
      setKeyError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    setBusy(true);
    try {
      const res = await fetch(`${api}/api/account/key`, { method: "DELETE", credentials: "include" });
      if (res.ok) setAccount((await res.json()) as Account);
      setNotice("Your key has been removed.");
    } finally {
      setBusy(false);
    }
  }

  const trial = account.trial;
  const fractionLeft = trial && trial.grantUsd > 0 ? trial.remainingUsd / trial.grantUsd : 0;
  // "At least", because every estimate is a worst case.
  const lessonsLeft = trial ? atLeast(trial.remainingUsd, account.estimates.tutor_lesson) : 0;
  const otherLeft = trial ? atLeast(trial.remainingUsd, account.estimates.classify) : 0;

  const pill =
    account.mode === "anon"
      ? { label: "Try the AI free · Sign in", tone: "bg-pine text-bone" }
      : account.mode === "byok"
        ? { label: `Your key ••••${account.key?.last4 ?? ""}`, tone: "bg-sky-800 text-white" }
        : account.mode === "exhausted"
          ? { label: "Credit used · Add a key", tone: "bg-ember text-white" }
          : {
              label: `${formatUsd(trial?.remainingUsd ?? 0)} credit`,
              tone: fractionLeft > 0.5 ? "bg-spruce text-white" : fractionLeft > 0.2 ? "bg-amber-600 text-white" : "bg-ember text-white",
            };

  return (
    <div ref={panel} className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-5 z-40 text-sm">
      {open && (
        <div
          role="dialog"
          aria-label="AI credit"
          className="absolute bottom-full left-0 mb-3 w-[min(22rem,calc(100vw-2.5rem))] rounded-lg border border-pine/15 bg-bone p-4 shadow-xl"
        >
          {notice && <p className="mb-3 rounded-md bg-pine/5 p-2.5 text-[13px] leading-snug text-pine">{notice}</p>}

          {account.mode === "anon" ? (
            <>
              <p className="font-semibold">Try the AI features for free</p>
              <p className="mt-1 text-[13px] leading-relaxed text-pine/70">
                Sign in with GitHub and get {account.enforced ? "free credit" : "credit"} to use the Tutor, the classifier and
                Ask Northwind on this site. No email, no card. When it runs out, bring your own Anthropic key.
              </p>
              <button
                onClick={signIn}
                className="mt-3 w-full rounded-md bg-pine px-3 py-2 font-semibold text-bone hover:bg-spruce"
              >
                Sign in with GitHub
              </button>
            </>
          ) : (
            <>
              {account.mode === "byok" && account.key ? (
                <div>
                  <p className="font-semibold">Using your Anthropic key ••••{account.key.last4}</p>
                  <p className="mt-1 text-[13px] text-pine/70">
                    {formatUsd(account.key.sessionSpentUsd)} spent this session. No limit from us; forgotten after 24 hours
                    unused or when you sign out.
                  </p>
                  <button
                    onClick={removeKey}
                    disabled={busy}
                    className="mt-2 text-[13px] font-semibold text-ember underline disabled:opacity-50"
                  >
                    Remove key
                  </button>
                </div>
              ) : (
                trial && (
                  <div>
                    <p className="font-semibold">
                      {formatUsd(trial.remainingUsd)} of {formatUsd(trial.grantUsd)} free credit left
                    </p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-pine/10" aria-hidden="true">
                      <div
                        className={`h-full ${fractionLeft > 0.5 ? "bg-spruce" : fractionLeft > 0.2 ? "bg-amber-600" : "bg-ember"}`}
                        style={{ width: `${Math.round(fractionLeft * 100)}%` }}
                      />
                    </div>
                    {account.mode === "trial" ? (
                      <p className="mt-2 text-[13px] text-pine/70">
                        {lessonsLeft + otherLeft > 0
                          ? `Enough for at least ${lessonsLeft} Tutor lessons or ${otherLeft} classifications. Most calls cost far less than the worst case reserved for them.`
                          : "Only enough left for quick previews. Add your own key for the Tutor, the classifier and Ask Northwind."}
                      </p>
                    ) : (
                      <p className="mt-2 text-[13px] text-pine/70">
                        {trial.grantUsd === 0
                          ? "Free credit is for GitHub accounts older than a month, while today's supply lasts."
                          : "You have used your free credit."}{" "}
                        Add your own key to keep going.
                      </p>
                    )}
                  </div>
                )
              )}

              {account.mode !== "byok" &&
                (keyOpen ? (
                  <form onSubmit={saveKey} className="mt-4 border-t border-pine/10 pt-3">
                    <label htmlFor="nw-api-key" className="block text-[13px] font-semibold">
                      Your Anthropic API key
                    </label>
                    <input
                      id="nw-api-key"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="sk-ant-…"
                      className="mt-1 w-full rounded-md border border-pine/20 bg-white px-2.5 py-1.5 font-mono text-[13px]"
                    />
                    <p className="mt-1.5 text-[12px] leading-snug text-pine/60">
                      Get one at{" "}
                      <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="underline">
                        console.anthropic.com
                      </a>
                      . Encrypted on our server, used only for your requests, never shown back, and deleted after 24 hours unused
                      or when you sign out. A key with a spend limit is a good idea.
                    </p>
                    {keyError && <p className="mt-1.5 text-[12px] font-semibold text-ember">{keyError}</p>}
                    <button
                      type="submit"
                      disabled={busy || keyInput.trim().length === 0}
                      className="mt-2 w-full rounded-md bg-pine px-3 py-2 font-semibold text-bone hover:bg-spruce disabled:opacity-50"
                    >
                      {busy ? "Checking with Anthropic…" : "Use this key"}
                    </button>
                  </form>
                ) : (
                  <button onClick={() => setKeyOpen(true)} className="mt-3 text-[13px] font-semibold underline">
                    Use your own Anthropic key
                  </button>
                ))}

              <p className="mt-4 flex items-center justify-between border-t border-pine/10 pt-3 text-[12px] text-pine/60">
                <span>Signed in as {account.login}</span>
                <button onClick={signOut} disabled={busy} className="font-semibold underline disabled:opacity-50">
                  Sign out
                </button>
              </p>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`rounded-full px-4 py-2.5 font-semibold shadow-lg ${pill.tone}`}
      >
        {pill.label}
      </button>
    </div>
  );
}
