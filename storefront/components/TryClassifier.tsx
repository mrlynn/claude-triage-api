"use client";

import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { labs } from "@/lib/links";

/**
 * The homepage's answer to "what is this and why should I care".
 *
 * WHY IT EXISTS: almost everyone who lands here arrives cold from a link and
 * leaves within a few seconds. The payoff of this whole site — watching your
 * own words get classified by a live model — used to sit behind "Contact
 * support", which nobody clicks, because a stranger browsing a fictional shop
 * does not have a broken tent. This puts the payoff on the landing page at
 * zero clicks and zero setup.
 *
 * WHY IT IS DELIBERATELY SMALLER THAN /support: this shows the verdict only.
 * The stage-by-stage narration, the cache accounting and the schema tour stay
 * on the support page, and this ends by pointing there. A visitor who is
 * curious gets one satisfying result; a visitor who is hooked gets a door.
 *
 * It posts to the plain JSON route rather than the streaming one — there is no
 * per-stage UI here to feed, and one request is one thing to get wrong.
 */

interface Outcome {
  triage: {
    category: string;
    urgency: string;
    summary: string;
    requires_human: boolean;
    escalation_reason: string | null;
    confidence: number;
  };
  cost_usd: number;
  cache_hit: boolean;
  latency_ms: number;
  ticket_id?: string;
}

const URGENCY_STYLE: Record<string, string> = {
  urgent: "bg-red-600 text-white",
  high: "bg-amber-500 text-amber-950",
  normal: "bg-pine/15 text-pine",
  low: "bg-pine/10 text-pine/60",
};

/*
  The three chips are chosen to discriminate, not to be representative. One
  routine warranty claim, one billing problem, and one that opens with
  "probably nothing" and is in fact a child safety report — the case the whole
  scenario is built around. A visitor who taps only one is most likely to tap
  the last, which is the one worth seeing.
*/
const EXAMPLES = [
  {
    label: "A broken zipper",
    text: "The zipper on my Ridgeline shell separated the second time I wore it. I would like a replacement.",
  },
  {
    label: "A double charge",
    text: "You charged me twice for the same order this morning. Two identical charges ten minutes apart.",
  },
  {
    label: '"Probably nothing"',
    text: "Probably nothing, but the lining inside my kid's bottle is flaking and she has been unwell this week.",
  },
];

export default function TryClassifier() {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SyntheticEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    setOutcome(null);

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json();

      if (!res.ok) {
        // The pipeline's failure detail is already written for a customer to
        // read ("give it a few minutes", "resets at midnight UTC"), so it goes
        // through unedited rather than being flattened into "request failed".
        setError(body.detail ?? "That did not go through. Try again in a moment.");
        setState("error");
        return;
      }

      setOutcome(body as Outcome);
      setState("done");
    } catch {
      setError("Could not reach the classifier. Check your connection.");
      setState("error");
    }
  }

  return (
    <section className="mb-14 overflow-hidden rounded-lg border border-pine/20 bg-white/50">
      {/* The ember rule is the one place on the page that is not the shop's
          own palette — it marks this panel as an aside from outside the
          fiction, which is exactly what it is. */}
      <div className="h-1 bg-ember" />

      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ember">
            The shop is invented. This part is not.
          </p>
          <h2 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            Type a complaint. Watch Claude decide who handles it.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-pine/70">
            Northwind gets 4,100 support tickets a week. Every one is read by a
            model before a person sees it, and the model decides which ones a
            person sees at all. Write anything below &mdash; angry, vague,
            rambling &mdash; and you get the same verdict a real ticket gets.
          </p>

          <form onSubmit={submit} className="mt-5">
            <label htmlFor="try-msg" className="sr-only">
              Describe a problem with your gear
            </label>
            <textarea
              id="try-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              minLength={10}
              required
              placeholder="My tent pole snapped on the second night and we had no shelter..."
              className="w-full rounded-md border border-pine/25 bg-white/80 p-3 text-sm outline-none focus:border-spruce"
            />

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-pine/50">Or try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setMessage(ex.text)}
                  className="rounded-full border border-pine/20 px-3 py-1 text-xs text-pine/75 hover:border-spruce hover:text-spruce"
                >
                  {ex.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={state === "sending" || message.trim().length < 10}
              className="mt-4 rounded-md bg-pine px-5 py-2.5 text-sm font-medium text-bone hover:bg-spruce disabled:opacity-40"
            >
              {state === "sending" ? "Reading it…" : "Classify it"}
            </button>
          </form>
        </div>

        {/* The right column is never empty. An idle placeholder that names the
            fields you are about to get makes the panel legible before you have
            typed anything, which is the only state most visitors will see. */}
        <div className="min-w-0 rounded-md border border-pine/15 bg-white/60 p-5">
          {state === "idle" && (
            <div className="text-sm text-pine/55">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/40">
                What comes back
              </p>
              <ul className="mt-3 space-y-2">
                <li>A category, chosen from a fixed set.</li>
                <li>An urgency, which decides the queue it lands in.</li>
                <li>Whether it needs a human, and why.</li>
                <li>What it cost, to four decimal places.</li>
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-pine/50">
                None of that is parsed out of prose. The shape is attached to
                the request and the API is constrained to it.
              </p>
            </div>
          )}

          {state === "sending" && (
            <p className="text-sm text-pine/55">
              Sending it to the model. This normally takes a second or two.
            </p>
          )}

          {error && (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          {outcome && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/40">
                The verdict
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded border border-pine/25 px-2 py-0.5 text-xs font-medium">
                  {outcome.triage.category}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                    URGENCY_STYLE[outcome.triage.urgency] ?? ""
                  }`}
                >
                  {outcome.triage.urgency}
                </span>
                {outcome.triage.requires_human && (
                  <span className="rounded bg-pine px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-bone">
                    human required
                  </span>
                )}
              </div>

              <p className="mt-3.5 text-sm font-medium">{outcome.triage.summary}</p>

              {outcome.triage.escalation_reason && (
                <p className="mt-3 rounded-md border border-pine/20 bg-pine/5 px-3 py-2 text-sm">
                  <span className="text-pine/55">Escalating because </span>
                  {outcome.triage.escalation_reason}
                </p>
              )}

              <p className="mt-4 border-t border-pine/12 pt-3 font-mono text-[11px] text-pine/50">
                {outcome.latency_ms}ms &middot; ${outcome.cost_usd.toFixed(4)}{" "}
                &middot; {outcome.cache_hit ? "cache hit" : "cache cold"}
                {outcome.ticket_id ? ` · queued as ${outcome.ticket_id}` : ""}
              </p>

              {/* The exit ramp, placed at the only moment we know the visitor
                  is interested: immediately after something surprised them. */}
              <div className="mt-4 space-y-1.5 text-xs">
                <p>
                  <Link href="/support" className="underline underline-offset-2">
                    File it properly and watch every stage
                  </Link>{" "}
                  <span className="text-pine/50">
                    &mdash; prompt, cache, schema, cost, one at a time.
                  </span>
                </p>
                {outcome.ticket_id && (
                  <p>
                    <Link href="/queue" className="underline underline-offset-2">
                      Read it in the reviewer queue
                    </Link>{" "}
                    <span className="text-pine/50">&mdash; no login.</span>
                  </p>
                )}
                <p>
                  <a
                    href={labs("/docs/labs/lab-2-structured-outputs")}
                    className="underline underline-offset-2"
                  >
                    Build this yourself
                  </a>{" "}
                  <span className="text-pine/50">
                    &mdash; the lab that writes the schema you just used.
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
