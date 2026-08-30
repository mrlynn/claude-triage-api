"use client";

import { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Pipeline, {
  STAGE_ORDER,
  type Stage,
  type StageId,
} from "@/components/Pipeline";
import FlowDiagram from "@/components/FlowDiagram";
import ProductArt from "@/components/ProductArt";
import { labs } from "@/lib/links";
import { getOrder } from "@/lib/orders";
import { getProduct, usd } from "@/lib/products";
import {
  CATEGORY_CHIP,
  HUMAN_CHIP,
  ERROR_BANNER,
  confidenceBar,
  urgencyChip,
} from "@/lib/triage-ui";

/**
 * The closed loop.
 *
 * An attendee writes a real complaint about a real (fictional) product, and
 * watches their own words get classified by the same schema the labs teach.
 * The classification panel below is not decoration: every field shown maps to
 * something in TriageSchema, and the copy explains what the field is for.
 */

interface TriageResult {
  category: string;
  urgency: string;
  sentiment: string;
  summary: string;
  requested_remedy: string;
  requires_human: boolean;
  escalation_reason: string | null;
  confidence: number;
}

interface Outcome {
  triage: TriageResult;
  cost_usd: number;
  cache_hit: boolean;
  latency_ms: number;
  total_ms: number;
  /** Set when the ticket was escalated and written to the reviewer queue. */
  ticket_id?: string;
}

function freshStages(): Record<StageId, Stage> {
  return Object.fromEntries(
    STAGE_ORDER.map((id) => [id, { id, status: "pending" as const }]),
  ) as Record<StageId, Stage>;
}

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

export default function SupportForm() {
  const params = useSearchParams();
  const productSlug = params.get("product") ?? undefined;
  const orderId = params.get("order") ?? undefined;
  const product = productSlug ? getProduct(productSlug) : undefined;
  const order = orderId ? getOrder(orderId) : undefined;

  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<StageId, Stage>>(freshStages);

  async function submit(e: SyntheticEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    setOutcome(null);
    setStages(freshStages());

    try {
      const res = await fetch("/api/support/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          product: productSlug,
          orderId,
        }),
      });

      if (!res.body) {
        setError("No response stream.");
        setState("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let failed = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice(6));

          if (event.type === "stage") {
            setStages((prev) => ({
              ...prev,
              [event.id as StageId]: {
                id: event.id,
                status: event.status,
                ms: event.ms ?? prev[event.id as StageId].ms,
                headline: event.headline ?? prev[event.id as StageId].headline,
                detail: event.detail ?? prev[event.id as StageId].detail,
              },
            }));
          } else if (event.type === "failure") {
            setError(event.detail ?? "Something went wrong.");
            failed = true;
          } else if (event.type === "result") {
            setOutcome(event as Outcome);
          }
        }
      }

      setState(failed ? "error" : "done");
    } catch {
      setError("Could not reach support. Check your connection and try again.");
      setState("error");
    }
  }

  return (
    <div className="grid min-w-0 gap-10 lg:grid-cols-2">
      <form onSubmit={submit} className="min-w-0">
        {(product || order) && (
          <div className="mb-4 flex gap-3 rounded-md border border-pine/20 bg-white/50 p-3">
            {product && (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
                <ProductArt
                  product={product}
                  className="h-full w-full !rounded-md"
                  sizes="64px"
                />
              </div>
            )}
            {!product && order?.items[0] && getProduct(order.items[0].slug) && (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
                <ProductArt
                  product={getProduct(order.items[0].slug)!}
                  className="h-full w-full !rounded-md"
                  sizes="64px"
                />
              </div>
            )}
            <div className="min-w-0 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/50">
                Regarding
              </p>
              {product && (
                <p className="font-semibold">
                  <Link href={`/products/${product.slug}`} className="hover:text-spruce">
                    {product.name}
                  </Link>
                </p>
              )}
              {order && (
                <>
                  <p className="font-mono text-sm font-semibold">{order.order_id}</p>
                  <p className="text-xs text-pine/60">
                    {order.items.map((it) => it.name).join(" · ")} · {usd(order.total_usd)}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <label htmlFor="msg" className="block text-sm font-semibold">
          What happened?
        </label>
        <p className="mt-1 text-xs text-pine/60">
          Write it the way you would actually write it. Vague, annoyed, or
          rambling is fine &mdash; that is what real tickets look like.
        </p>
        <textarea
          id="msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={7}
          maxLength={2000}
          required
          minLength={10}
          className="mt-2 w-full rounded-md border border-pine/25 bg-white/70 p-3 text-sm outline-none focus:border-spruce"
          placeholder="Tell us what went wrong..."
        />
        <div className="mt-1 flex justify-between text-xs text-pine/50">
          <span>{message.length} / 2000</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setMessage(ex.text)}
              className="rounded border border-pine/20 px-2.5 py-1 text-xs text-pine/70 hover:border-spruce hover:text-spruce"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={state === "sending" || message.trim().length < 10}
          className="mt-5 rounded-md bg-pine px-5 py-2.5 text-sm font-medium text-bone hover:bg-spruce disabled:opacity-40"
        >
          {state === "sending" ? "Sending..." : "Submit ticket"}
        </button>

        {error && <p className={`mt-3 ${ERROR_BANNER}`}>{error}</p>}
      </form>

      <div className="min-w-0">
        <h2 className="text-sm font-semibold">What our system did with it</h2>
        <p className="mt-1 text-xs text-pine/60">
          Normally you would never see any of this. Every step below is real
          and timed as it happens &mdash; click <em>why</em> on any of them.
        </p>

        <div className="mt-4 rounded-lg border border-pine/20 bg-white/40 p-4">
          <FlowDiagram
            stages={stages}
            state={state}
            category={outcome?.triage.category}
            escalated={Boolean(outcome?.ticket_id)}
          />
          {state === "idle" && (
            <p className="mt-1 text-center text-xs text-pine/45">
              Submit a ticket and watch it travel this path for real.
            </p>
          )}
        </div>

        {(state === "sending" || state === "done" || state === "error") && (
          <div className="mt-4 rounded-lg border border-pine/20 bg-white/40 p-4">
            <Pipeline stages={stages} totalMs={outcome?.total_ms} />
          </div>
        )}

        {outcome && (
          <div className="mt-4 rounded-lg border border-pine/20 bg-white/60 p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-pine/45">
              The classification
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={CATEGORY_CHIP}>{outcome.triage.category}</span>
              <span className={urgencyChip(outcome.triage.urgency)}>
                {outcome.triage.urgency}
              </span>
              {outcome.triage.requires_human && (
                <span className={HUMAN_CHIP}>human required</span>
              )}
            </div>

            {outcome.ticket_id && (
              <div className="mt-4 rounded-md border border-ember/35 bg-ember/8 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ember">
                  Escalated to a person
                </p>
                <p className="mt-1 text-sm text-pine">
                  Queued as{" "}
                  <span className="font-mono font-semibold">{outcome.ticket_id}</span>.
                  A specialist picks this up from the review queue; it is not
                  waiting on an automated reply.
                </p>
                <Link
                  href={`/queue#${outcome.ticket_id}`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-pine px-3.5 py-1.5 text-sm text-bone hover:bg-spruce"
                >
                  Open in the escalation queue →
                </Link>
              </div>
            )}

            <p className="mt-4 text-sm font-medium">{outcome.triage.summary}</p>

            <dl className="mt-4 space-y-2.5 text-sm">
              <Row label="Sentiment" value={outcome.triage.sentiment} />
              <Row label="You asked for" value={outcome.triage.requested_remedy} />
              {outcome.triage.escalation_reason && (
                <Row label="Escalating because" value={outcome.triage.escalation_reason} />
              )}
            </dl>

            <div className="mt-4">
              <div className="flex justify-between text-xs text-pine/60">
                <span>Confidence</span>
                <span className="font-mono">
                  {outcome.triage.confidence.toFixed(2)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-pine/12">
                <div
                  className={confidenceBar(outcome.triage.confidence)}
                  style={{ width: `${outcome.triage.confidence * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-pine/55">
                {outcome.triage.confidence < 0.6
                  ? "Low. The system is telling us it is unsure, so a person checks this one."
                  : "The system is confident enough to route this without a second opinion."}
              </p>
            </div>

            <p className="mt-4 border-t border-pine/12 pt-3 font-mono text-[11px] text-pine/50">
              {outcome.latency_ms}ms &middot; ${outcome.cost_usd.toFixed(4)} &middot;{" "}
              {outcome.cache_hit ? "cache hit" : "cache cold"}
            </p>

            <p className="mt-3 text-xs leading-relaxed text-pine/65">
              {outcome.cache_hit
                ? "That cache hit is the policy handbook being read from cache instead of paid for again. It is most of the input on every request."
                : "First call, so the handbook was written to cache. The next one costs about a fifth as much."}{" "}
              <a
                href={labs("/playground/queue")}
                className="underline underline-offset-2"
              >
                See where a ticket like yours lands in the course queue
              </a>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4">
      <dt className="w-32 shrink-0 text-pine/55">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
