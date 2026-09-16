import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { storefrontApi } from "@site/src/urls";
import { atLeast, crossedThreshold, onGate, onMeter, type Account, type GateBody } from "./accountClient";
import styles from "./styles.module.css";

/**
 * The credit meter on the course site: a pill in the corner, a panel when
 * opened. The account lives on the storefront, which holds the key; this page
 * reads it cross-origin with credentials, like Ask Northwind does.
 *
 * The storefront renders the same component (storefront/components/
 * AccountMeter.tsx). Keep the two saying the same things.
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

export default function AccountMeter() {
  const howItWorks = useBaseUrl("/credit");
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
    const next = await fetchAccount(storefrontApi());
    if (next) setAccount(next);
  }, []);

  useEffect(() => {
    // Back from GitHub: say what happened once, then take the flag out of the URL.
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("signin");
    if (flag) {
      url.searchParams.delete("signin");
      window.history.replaceState(window.history.state, "", url.toString());
    }
    void fetchAccount(storefrontApi()).then((next) => {
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
  }, [refresh]);

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
    window.location.href = `${storefrontApi()}${account!.signInPath}?returnTo=${encodeURIComponent(back.toString())}`;
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch(`${storefrontApi()}/api/auth/signout`, { method: "POST", credentials: "include" });
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
      const res = await fetch(`${storefrontApi()}/api/account/key`, {
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
      const res = await fetch(`${storefrontApi()}/api/account/key`, { method: "DELETE", credentials: "include" });
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
  const otherLeft = trial ? atLeast(trial.remainingUsd, account.estimates.tutor_hint) : 0;
  const tone = fractionLeft > 0.5 ? styles.good : fractionLeft > 0.2 ? styles.low : styles.out;
  const toneColor = fractionLeft > 0.5 ? "var(--nw-spruce)" : fractionLeft > 0.2 ? "#b7791f" : "var(--nw-ember)";

  const pill =
    account.mode === "anon"
      ? { label: "Try the AI free · Sign in", tone: styles.anon }
      : account.mode === "byok"
        ? { label: `Your key ••••${account.key?.last4 ?? ""}`, tone: styles.byok }
        : account.mode === "exhausted"
          ? { label: "Credit used · Add a key", tone: styles.out }
          : { label: `${formatUsd(trial?.remainingUsd ?? 0)} credit`, tone };

  return (
    <div ref={panel} className={styles.meter}>
      {open && (
        <div role="dialog" aria-label="AI credit" className={styles.panel}>
          {notice && <p className={styles.notice}>{notice}</p>}

          {account.mode === "anon" ? (
            <>
              <p className={styles.title}>Try the AI features for free</p>
              <p className={styles.muted}>
                Sign in with GitHub and get free credit to use the Tutor and Ask Northwind here, and the demos on the
                storefront. No email, no card. When it runs out, bring your own Anthropic key.
              </p>
              <button onClick={signIn} className={styles.primary}>
                Sign in with GitHub
              </button>
              <a href={howItWorks} className={styles.more}>
                How free credit works
              </a>
            </>
          ) : (
            <>
              {account.mode === "byok" && account.key ? (
                <div>
                  <p className={styles.title}>Using your Anthropic key ••••{account.key.last4}</p>
                  <p className={styles.muted}>
                    {formatUsd(account.key.sessionSpentUsd)} spent this session. No limit from us; forgotten after 24 hours
                    unused or when you sign out.
                  </p>
                  <button onClick={removeKey} disabled={busy} className={styles.link}>
                    Remove key
                  </button>
                </div>
              ) : (
                trial && (
                  <div>
                    <p className={styles.title}>
                      {formatUsd(trial.remainingUsd)} of {formatUsd(trial.grantUsd)} free credit left
                    </p>
                    <div className={styles.bar} aria-hidden="true">
                      <div style={{ width: `${Math.round(fractionLeft * 100)}%`, background: toneColor }} />
                    </div>
                    {account.mode === "trial" ? (
                      <p className={styles.muted}>
                        {lessonsLeft + otherLeft > 0
                          ? `Enough for at least ${lessonsLeft} Tutor lessons or ${otherLeft} hints. Most calls cost far less than the worst case reserved for them.`
                          : "Only enough left for quick previews. Add your own key for the Tutor, the classifier and Ask Northwind."}
                      </p>
                    ) : (
                      <p className={styles.muted}>
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
                  <form onSubmit={saveKey} className={styles.form}>
                    <label htmlFor="nw-api-key">Your Anthropic API key</label>
                    <input
                      id="nw-api-key"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="sk-ant-…"
                    />
                    <ul className={styles.points}>
                      <li>
                        Use a key made just for this course, from{" "}
                        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                          console.anthropic.com
                        </a>
                        .
                      </li>
                      <li>Only its last four characters are ever shown again. It is deleted after 24 hours unused.</li>
                      <li>Remove it here, or disable it in the Console, any time.</li>
                    </ul>
                    <a href={`${howItWorks}#is-my-key-safe`} className={styles.more}>
                      Is my key safe?
                    </a>
                    {keyError && <p className={styles.error}>{keyError}</p>}
                    <button type="submit" disabled={busy || keyInput.trim().length === 0} className={styles.primary}>
                      {busy ? "Checking with Anthropic…" : "Use this key"}
                    </button>
                  </form>
                ) : (
                  <button onClick={() => setKeyOpen(true)} className={styles.link}>
                    Use your own Anthropic key
                  </button>
                ))}

              <p className={styles.footer}>
                <span>
                  Signed in as {account.login} · <a href={howItWorks}>How credit works</a>
                </span>
                <button onClick={signOut} disabled={busy} className={styles.link}>
                  Sign out
                </button>
              </p>
            </>
          )}
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`${styles.pill} ${pill.tone}`}>
        {pill.label}
      </button>
    </div>
  );
}
