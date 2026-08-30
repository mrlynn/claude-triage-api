"use client";

import { useState } from "react";
import payloads from "@/data/injections.json";
import {
  CATEGORY_CHIP,
  HUMAN_CHIP,
  urgencyChip,
} from "@/lib/triage-ui";

/**
 * Live injection playground.
 *
 * Deliberately shows THREE things rather than a verdict:
 *   1. what the model was actually shown, after escaping
 *   2. the classification it returned
 *   3. the same two with the defences off
 *
 * A pass/fail badge would be the wrong output. "Blocked" is not a property of
 * a classifier — the classifier always returns a classification — and the
 * interesting question is whether the injected instruction moved any field,
 * which the reader can only judge by seeing the fields.
 */

interface Payload {
  id: string;
  family: string;
  message: string;
  benign: boolean;
  blurb: string;
}

interface Triage {
  category: string;
  urgency: string;
  sentiment: string;
  summary: string;
  requires_human: boolean;
  escalation_reason: string | null;
  confidence: number;
}

interface Result {
  defended: boolean;
  shown_to_model: string;
  redactions: number;
  triage: Triage;
  model: string;
}

const CASES = payloads as unknown as Payload[];

export default function InjectionPlayground() {
  const [message, setMessage] = useState(CASES[0]?.message ?? "");
  const [selected, setSelected] = useState(CASES[0]?.id ?? "");
  const [defended, setDefended] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = CASES.find((c) => c.id === selected);

  function pick(id: string) {
    const c = CASES.find((x) => x.id === id);
    if (!c) return;
    setSelected(id);
    setMessage(c.message);
    setResult(null);
    setError(null);
  }

  async function run() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/injection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, defended }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.detail ?? "Something went wrong.");
        return;
      }
      setResult(body as Result);
    } catch {
      setError("The request failed. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-lg border border-pine/15 bg-white/40 p-5">
          <label
            htmlFor="payload"
            className="text-[11px] uppercase tracking-wide text-pine/50"
          >
            Payload
          </label>
          <select
            id="payload"
            value={selected}
            onChange={(e) => pick(e.target.value)}
            className="mt-2 w-full rounded-md border border-pine/20 bg-bone px-3 py-2 text-sm text-pine"
          >
            {CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} — {c.family.replace(/_/g, " ")}
                {c.benign ? " (legitimate customer)" : ""}
              </option>
            ))}
          </select>

          {chosen && (
            <p className="mt-3 text-xs text-pine/60">
              {chosen.benign ? (
                <span className="font-medium text-pine/80">
                  This one is a control.{" "}
                </span>
              ) : null}
              {chosen.blurb}
            </p>
          )}

          <label
            htmlFor="message"
            className="mt-4 block text-[11px] uppercase tracking-wide text-pine/50"
          >
            Message (edit freely)
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setResult(null);
            }}
            rows={9}
            maxLength={2000}
            className="mt-2 w-full rounded-md border border-pine/20 bg-bone px-3 py-2 font-mono text-xs text-pine"
          />

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-pine/80">
              <input
                type="checkbox"
                checked={defended}
                onChange={(e) => {
                  setDefended(e.target.checked);
                  setResult(null);
                }}
              />
              Defences on
            </label>
            <button
              type="button"
              onClick={run}
              disabled={sending || message.trim().length < 10}
              className="rounded-md bg-pine px-5 py-2.5 text-bone hover:bg-spruce disabled:opacity-50"
            >
              {sending ? "Classifying…" : "Classify"}
            </button>
          </div>

          {!defended && (
            <p className="mt-3 border-l-2 border-ember pl-3 text-xs text-pine/70">
              Defences off reproduces this app&rsquo;s behaviour before the
              trust boundary was fixed: the message is interpolated into the
              delimiters raw, so a message containing{" "}
              <code>&lt;/customer_message&gt;</code> can write its way out of
              the data block.
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-md bg-ember/10 px-3 py-2 text-sm text-ember">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {result ? (
          <>
            <div className="rounded-lg border border-pine/15 bg-white/40 p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-pine">Classification</h2>
                <span className="text-[11px] uppercase tracking-wide text-pine/50">
                  {result.defended ? "defended" : "undefended"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className={CATEGORY_CHIP}>{result.triage.category}</span>
                <span className={urgencyChip(result.triage.urgency)}>
                  {result.triage.urgency}
                </span>
                <span className={CATEGORY_CHIP}>{result.triage.sentiment}</span>
                {result.triage.requires_human && (
                  <span className={HUMAN_CHIP}>human required</span>
                )}
              </div>

              <p className="mt-3 text-sm text-pine/80">{result.triage.summary}</p>

              {result.triage.escalation_reason && (
                <p className="mt-2 text-xs text-pine/60">
                  Escalation reason: {result.triage.escalation_reason}
                </p>
              )}

              <p className="mt-3 font-mono text-[11px] tabular-nums text-pine/50">
                confidence {result.triage.confidence.toFixed(2)} · {result.model}
                {result.redactions > 0
                  ? ` · ${result.redactions} redaction${result.redactions === 1 ? "" : "s"} before the model saw it`
                  : ""}
              </p>
            </div>

            <div className="rounded-lg border border-pine/15 bg-white/40 p-5">
              <h2 className="text-sm font-semibold text-pine">
                What the model was actually shown
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px]">
                <div
                  className={`rounded-md border px-2 py-2 ${
                    result.defended
                      ? "border-spruce/40 bg-spruce/10 text-pine"
                      : "border-pine/15 bg-pine/5 text-pine/45"
                  }`}
                >
                  <p className="font-semibold uppercase tracking-wide">Escaped</p>
                  <p className="mt-0.5 text-pine/65">&lt; → &amp;lt;</p>
                </div>
                <div
                  className={`rounded-md border px-2 py-2 ${
                    !result.defended
                      ? "border-ember/40 bg-ember/10 text-ember"
                      : "border-pine/15 bg-pine/5 text-pine/45"
                  }`}
                >
                  <p className="font-semibold uppercase tracking-wide">Raw</p>
                  <p className="mt-0.5">tags stay real</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-pine/60">
                {result.defended
                  ? "Every < in the payload became &lt;, so the only real tags in this block are the two we wrote."
                  : "Raw interpolation. Any tags in the payload are real tags here."}
              </p>
              <pre className="mt-3 max-h-72 overflow-auto rounded bg-pine/5 p-3 font-mono text-[11px] leading-relaxed text-pine/80">
                {result.shown_to_model}
              </pre>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-pine/20 bg-white/20 p-5 text-sm text-pine/60">
            Pick a payload and hit Classify. Run it once with the defences on
            and once with them off — the difference is easiest to see on{" "}
            <code>inj-02</code>, which closes the delimiter and opens a forged
            system block.
          </div>
        )}
      </div>
    </div>
  );
}
