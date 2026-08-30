"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  SENTIMENT_CHIP,
  URGENCY_CHIP,
  ERROR_BANNER,
} from "@/lib/triage-ui";

/**
 * The as-you-type evaluator.
 *
 * THE HARD PART OF THIS COMPONENT IS NOT THE STREAMING. It is deciding when
 * NOT to call the model, and what to do with an answer that arrived after the
 * question changed. Three rules, and every one of them exists because the
 * naive version is wrong in a way you only see under a real keyboard:
 *
 *   1. **Fire on the pause, not the keystroke.** A 600ms debounce turns a
 *      50-character sentence from ~50 requests into two or three. Nobody can
 *      read a verdict mid-word anyway, so the faster version would be both
 *      more expensive and less useful.
 *   2. **Abort the previous run.** Every new run cancels the one in flight,
 *      which stops the model generating an answer to a question that no longer
 *      exists. Without this the bill is set by your typing speed.
 *   3. **Stamp every run and ignore late ones.** Abort is not instantaneous,
 *      and two streams can briefly overlap. The sequence number is what
 *      guarantees a slow early answer can never overwrite a fast later one —
 *      the classic out-of-order bug, and the one that makes a live UI flicker
 *      backwards for reasons that look like magic.
 *
 * The fourth rule has no code: what is shown is labelled a READING, not a
 * verdict. It comes from a cheaper model on an unfinished sentence, and the
 * panel says so, because a confident-looking wrong answer is worse than a
 * hedged right one.
 */

type Field = "category" | "sentiment" | "urgency" | "requires_human" | "confidence";

const FIELDS: { name: Field; label: string }[] = [
  { name: "category", label: "Category" },
  { name: "sentiment", label: "Sentiment" },
  { name: "urgency", label: "Urgency" },
  { name: "requires_human", label: "Needs a human" },
  { name: "confidence", label: "Confidence" },
];

interface Reading {
  category?: string;
  sentiment?: string;
  urgency?: string;
  requires_human?: boolean;
  confidence?: number;
}

interface Meta {
  model: string;
  cost_usd: number;
  cache_hit: boolean;
  cached_tokens: number;
  first_field_ms: number | null;
  total_ms: number;
}

/** What the real classifier returns when you commit. */
interface Verdict {
  triage: {
    category: string;
    urgency: string;
    sentiment: string;
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

const MIN_CHARS = 12;
const DEBOUNCE_MS = 600;

const SENTIMENT_STYLE = SENTIMENT_CHIP;
const URGENCY_STYLE = URGENCY_CHIP;

const EXAMPLES = [
  {
    label: "Starts calm, turns urgent",
    text: "Hi — I ordered the Kettle Ridge bottle last month and I want to flag something. The lining inside has started flaking. My daughter has been drinking from it all week and she has been unwell since Tuesday.",
  },
  {
    label: "Angry about money",
    text: "This is the third time you have charged my card for an order I cancelled. I have called twice. Nobody calls back. Refund it today or I am going to my bank.",
  },
  {
    label: "Polite and low stakes",
    text: "No rush at all, but I wanted to ask whether the Ridgeline shell comes in a tall size. Happy to wait if it is coming back in stock.",
  },
];

function pretty(field: Field, value: unknown): string {
  if (field === "requires_human") return value ? "yes" : "no";
  if (field === "confidence") return typeof value === "number" ? value.toFixed(2) : "";
  return String(value).replace(/_/g, " ");
}

function chipClass(field: Field, value: unknown): string {
  if (field === "sentiment") return SENTIMENT_STYLE[String(value)] ?? "bg-pine/10";
  if (field === "urgency") return URGENCY_STYLE[String(value)] ?? "bg-pine/10";
  if (field === "requires_human")
    return value ? "bg-pine text-bone" : "bg-pine/10 text-pine/60";
  return "bg-pine/10 text-pine/75";
}

export default function LiveEvaluator() {
  const [message, setMessage] = useState("");
  const [reading, setReading] = useState<Reading>({});
  const [meta, setMeta] = useState<Meta | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "waiting" | "thinking" | "settled" | "paused"
  >("idle");
  const [notice, setNotice] = useState<string | null>(null);

  // Session accounting. The running total is not decoration — an as-you-type
  // classifier is the first thing in this app where the cost of a feature is
  // set by user behaviour rather than by request count, and the only honest
  // way to show that is to add it up in front of you.
  const [runs, setRuns] = useState(0);
  const [spent, setSpent] = useState(0);

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (text: string) => {
    // Rule 3: this run's identity. Every write below is guarded by it.
    const mine = ++seq.current;

    // Rule 2: whatever is in flight is now answering a stale question.
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setPhase("thinking");
    setReading({});
    setMeta(null);

    let res: Response;
    try {
      res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });
    } catch {
      // Aborted, or offline. An abort is the normal case and says nothing.
      if (mine === seq.current) setPhase("idle");
      return;
    }

    if (!res.ok || !res.body) {
      const detail = await res
        .json()
        .then((b) => b.detail as string)
        .catch(() => null);
      if (mine === seq.current) {
        setPhase("paused");
        setNotice(detail ?? "The live pass is unavailable.");
      }
      return;
    }

    const decoder = new TextDecoder();
    const stream = res.body.getReader();
    let buffered = "";

    try {
      for (;;) {
        const { done, value } = await stream.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line. Anything after the last
        // one is a partial frame and stays in the buffer.
        const frames = buffered.split("\n\n");
        buffered = frames.pop() ?? "";

        for (const frame of frames) {
          const event = /^event: (.+)$/m.exec(frame)?.[1];
          const raw = /^data: (.+)$/m.exec(frame)?.[1];
          if (!event || !raw) continue;
          const data = JSON.parse(raw);

          // The staleness gate. Everything past here writes to state, so
          // everything past here has to prove it is still the current run.
          if (mine !== seq.current) continue;

          if (event === "field") {
            setReading((prev) => ({ ...prev, [data.name as Field]: data.value }));
          } else if (event === "done") {
            setMeta(data as Meta);
            setPhase("settled");
            setRuns((n) => n + 1);
            setSpent((s) => s + (data.cost_usd as number));
            setNotice(null);
          } else if (event === "failure") {
            setPhase("paused");
            setNotice(data.detail as string);
          }
        }
      }
    } catch {
      // Reader torn down by an abort. Nothing to report.
    }
  }, []);

  // Rule 1: the debounce. Every edit reschedules; only a pause fires.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    const text = message.trim();
    if (text.length < MIN_CHARS) {
      abort.current?.abort();
      seq.current++; // invalidate anything still in flight
      setPhase("idle");
      setReading({});
      setMeta(null);
      return;
    }

    setPhase("waiting");
    timer.current = setTimeout(() => void run(text), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, run]);

  // Editing the message invalidates the committed verdict — it was a verdict
  // on different words. Leaving it on screen would invite a comparison
  // between the live reading and a verdict about a message that no longer
  // exists, which is exactly the wrong lesson.
  useEffect(() => {
    setVerdict(null);
    setCommitError(null);
  }, [message]);

  useEffect(() => () => abort.current?.abort(), []);

  async function commit() {
    setCommitting(true);
    setCommitError(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setCommitError(body.detail ?? "That did not go through.");
        return;
      }
      setVerdict(body as Verdict);
    } catch {
      setCommitError("Could not reach the classifier.");
    } finally {
      setCommitting(false);
    }
  }

  const disagreements = verdict
    ? (["category", "urgency", "sentiment", "requires_human"] as const).filter(
        (k) => reading[k] !== undefined && reading[k] !== verdict.triage[k],
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* ---- The writing surface ---------------------------------- */}
        <div className="min-w-0">
          <label htmlFor="live-msg" className="sr-only">
            Write a support message
          </label>
          <textarea
            id="live-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={9}
            maxLength={2000}
            placeholder="Start typing a complaint. Stop for half a second and the panel on the right will begin filling in…"
            className="w-full resize-y rounded-md border border-pine/25 bg-white/80 p-4 text-sm leading-relaxed outline-none focus:border-spruce"
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
            {message && (
              <button
                type="button"
                onClick={() => setMessage("")}
                className="rounded-full px-2 py-1 text-xs text-pine/45 hover:text-ember"
              >
                clear
              </button>
            )}
          </div>

          {/* The commit step. This is the point of the whole page: the cheap
              reading is a hint, and here is the real one to check it against. */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={commit}
              disabled={committing || message.trim().length < 10}
              className="rounded-md bg-pine px-4 py-2 text-sm font-medium text-bone hover:bg-spruce disabled:opacity-40"
            >
              {committing ? "Running the real classifier…" : "Commit it to Opus"}
            </button>
            <span className="text-xs text-pine/50">
              The preview is Haiku. This runs the classifier a real ticket gets.
            </span>
          </div>
          {commitError && <p className={`mt-3 ${ERROR_BANNER}`}>{commitError}</p>}
        </div>

        {/* ---- The live panel --------------------------------------- */}
        <aside className="rounded-lg border border-pine/20 bg-white/70 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pine/45">
              Live reading
            </p>
            <Status phase={phase} />
          </div>

          <dl className="mt-4 space-y-2.5">
            {FIELDS.map(({ name, label }) => {
              const value = reading[name];
              const known = value !== undefined;
              return (
                <div key={name} className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-pine/55">{label}</dt>
                  <dd className="min-w-0">
                    {known ? (
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${chipClass(
                          name,
                          value,
                        )}`}
                      >
                        {pretty(name, value)}
                      </span>
                    ) : (
                      <span
                        className={`inline-block h-5 w-16 rounded bg-pine/10 ${
                          phase === "thinking" ? "animate-pulse" : ""
                        }`}
                        aria-hidden
                      />
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          {notice && (
            <p className="mt-4 rounded border border-ember/30 bg-ember/5 px-2.5 py-2 text-xs text-pine/75">
              {notice}
            </p>
          )}

          {meta && (
            <p className="mt-4 border-t border-pine/12 pt-3 font-mono text-[10px] leading-relaxed text-pine/50">
              {meta.first_field_ms ?? "–"}ms to first field · {meta.total_ms}ms total
              <br />
              {meta.cache_hit
                ? `${meta.cached_tokens.toLocaleString()} tokens read from cache`
                : "cache cold — this one paid the write"}
              <br />${meta.cost_usd.toFixed(5)} · {meta.model}
            </p>
          )}

          <p className="mt-4 border-t border-pine/12 pt-3 text-[11px] leading-relaxed text-pine/55">
            <span className="font-semibold text-pine/70">
              {runs} preview{runs === 1 ? "" : "s"} · ${spent.toFixed(5)}
            </span>{" "}
            this session. One committed Opus classification costs roughly what
            fifty of these do.
          </p>
        </aside>
      </div>

      {/* ---- Preview against verdict ------------------------------- */}
      {verdict && (
        <section className="rounded-lg border border-pine/20 bg-white/60 p-5">
          <h2 className="text-sm font-semibold text-pine">
            The reading, against the verdict
          </h2>
          <p className="mt-1 text-sm text-pine/65">
            {disagreements.length === 0
              ? "Haiku and Opus agreed on every field. That is the common case, and it is why the preview is worth showing at all."
              : `They disagreed on ${disagreements.length} field${
                  disagreements.length === 1 ? "" : "s"
                }. This is the cost of the cheap pass, made visible rather than argued about.`}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-pine/15 text-left text-[11px] uppercase tracking-wide text-pine/45">
                  <th className="py-1.5 pr-4 font-medium">Field</th>
                  <th className="py-1.5 pr-4 font-medium">Preview (Haiku)</th>
                  <th className="py-1.5 font-medium">Verdict (Opus)</th>
                </tr>
              </thead>
              <tbody>
                {(["category", "urgency", "sentiment", "requires_human", "confidence"] as const).map(
                  (k) => {
                    const left = reading[k];
                    const right = verdict.triage[k];
                    const differs =
                      k !== "confidence" && left !== undefined && left !== right;
                    return (
                      <tr key={k} className="border-b border-pine/8 last:border-0">
                        <td className="py-2 pr-4 text-pine/55">{k.replace(/_/g, " ")}</td>
                        <td className={`py-2 pr-4 ${differs ? "text-ember" : ""}`}>
                          {left === undefined ? "—" : pretty(k as Field, left)}
                        </td>
                        <td className={`py-2 font-medium ${differs ? "text-ember" : ""}`}>
                          {pretty(k as Field, right)}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-sm">
            <span className="text-pine/55">Summary: </span>
            {verdict.triage.summary}
          </p>
          {verdict.triage.escalation_reason && (
            <p className="mt-2 rounded-md border border-pine/20 bg-pine/5 px-3 py-2 text-sm">
              <span className="text-pine/55">Escalating because </span>
              {verdict.triage.escalation_reason}
            </p>
          )}
          <p className="mt-4 font-mono text-[11px] text-pine/50">
            {verdict.latency_ms}ms · ${verdict.cost_usd.toFixed(4)} ·{" "}
            {verdict.cache_hit ? "cache hit" : "cache cold"}
            {verdict.ticket_id ? ` · queued as ${verdict.ticket_id}` : ""}
          </p>
          {verdict.ticket_id && (
            <p className="mt-2 text-xs">
              <Link href="/queue" className="underline underline-offset-2">
                Read it in the reviewer queue
              </Link>{" "}
              <span className="text-pine/50">— no login.</span>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/** The one bit of state the visitor genuinely needs narrated. */
function Status({ phase }: { phase: string }) {
  const label: Record<string, string> = {
    idle: "waiting for words",
    waiting: "waiting for you to pause",
    thinking: "reading it",
    settled: "settled",
    paused: "paused",
  };
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-pine/50">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          phase === "thinking"
            ? "animate-pulse bg-ember"
            : phase === "settled"
              ? "bg-spruce"
              : phase === "paused"
                ? "bg-ember/50"
                : "bg-pine/25"
        }`}
        aria-hidden
      />
      {label[phase]}
    </span>
  );
}
