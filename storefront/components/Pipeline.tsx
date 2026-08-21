"use client";

import { useState } from "react";
import { labs } from "@/lib/links";

/**
 * The teaching surface.
 *
 * Seven stages, rendered as they actually happen, with real measured timings.
 * The stage list is deliberately not smoothed: six of the seven complete in
 * single-digit milliseconds and one takes several seconds, and seeing that
 * ratio is most of the lesson. Latency in an LLM feature is the model call,
 * essentially all of it.
 *
 * Each stage carries a "why" rather than only a "what", because a learner who
 * sees "Rate limit: allowed" has learned nothing, and one who sees why the
 * ceiling is checked before the spend has learned the whole idea.
 */

export type StageId =
  | "validate"
  | "ratelimit"
  | "prompt"
  | "schema"
  | "model"
  | "parse"
  | "account"
  | "persist";

export interface Stage {
  id: StageId;
  status: "pending" | "running" | "done" | "failed";
  ms?: number;
  headline?: string;
  detail?: Record<string, unknown>;
}

export const STAGE_META: Record<
  StageId,
  { title: string; sub: string; lab?: { label: string; href: string } }
> = {
  validate: {
    title: "Validate the input",
    sub: "Zod, before anything spends money",
  },
  ratelimit: {
    title: "Check the spend ceiling",
    sub: "Two atomic increments in MongoDB",
  },
  prompt: {
    title: "Assemble the prompt",
    sub: "Frozen block, then volatile block",
    lab: {
      label: "Lab 5",
      href: labs("/docs/labs/lab-5-prompt-caching"),
    },
  },
  schema: {
    title: "Constrain the output",
    sub: "A schema, not a please-return-JSON",
    lab: {
      label: "Lab 2",
      href: labs("/docs/labs/lab-2-structured-outputs"),
    },
  },
  model: {
    title: "Call Claude",
    sub: "The only slow thing here",
    lab: {
      label: "Lab 1",
      href: labs("/docs/labs/lab-1-first-call"),
    },
  },
  parse: {
    title: "Validate the response",
    sub: "parsed_output can be null",
  },
  account: {
    title: "Account for it",
    sub: "Four usage fields, not one",
    lab: {
      label: "Lab 5",
      href: labs("/docs/labs/lab-5-prompt-caching"),
    },
  },
  persist: {
    title: "Queue it for a human",
    sub: "Only when requires_human is true",
    lab: {
      label: "Lab 8",
      href: labs("/docs/labs/lab-8-trust-boundary"),
    },
  },
};

export const STAGE_ORDER: StageId[] = [
  "validate",
  "ratelimit",
  "prompt",
  "schema",
  "model",
  "parse",
  "account",
  "persist",
];

function Dot({ status }: { status: Stage["status"] }) {
  if (status === "done")
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-spruce text-[11px] font-bold text-white">
        ✓
      </span>
    );
  if (status === "failed")
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[11px] font-bold text-white">
        !
      </span>
    );
  if (status === "running")
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-spruce border-t-transparent animate-spin" />
    );
  return <span className="h-5 w-5 rounded-full border-2 border-pine/20" />;
}

function Detail({ detail }: { detail: Record<string, unknown> }) {
  const why = detail.why as string | undefined;
  const rest = Object.entries(detail).filter(([k]) => k !== "why");

  return (
    <div className="mt-2 min-w-0 rounded-md border border-pine/15 bg-white/60 p-3 text-xs">
      {why && <p className="leading-relaxed text-pine/80">{why}</p>}
      {rest.length > 0 && (
        <dl className={`space-y-1 ${why ? "mt-2.5 border-t border-pine/10 pt-2.5" : ""}`}>
          {rest.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <dt className="font-mono text-[11px] text-pine/50 sm:w-40 sm:shrink-0">{k}</dt>
              <dd className="min-w-0 break-words font-mono text-[11px] text-pine/80">
                {Array.isArray(v)
                  ? v
                      .map((item) =>
                        typeof item === "object" && item !== null
                          ? `${(item as { name: string }).name}: ${(item as { type: string }).type}`
                          : String(item),
                      )
                      .join("\n")
                  : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export default function Pipeline({
  stages,
  totalMs,
}: {
  stages: Record<StageId, Stage>;
  totalMs?: number;
}) {
  const [open, setOpen] = useState<StageId | null>(null);
  const modelMs = stages.model.ms ?? 0;
  const everythingElse = STAGE_ORDER.filter((id) => id !== "model").reduce(
    (a, id) => a + (stages[id].ms ?? 0),
    0,
  );

  return (
    <div className="min-w-0">
      <ol className="space-y-1">
        {STAGE_ORDER.map((id) => {
          const stage = stages[id];
          const meta = STAGE_META[id];
          const isOpen = open === id;
          const clickable = Boolean(stage.detail);

          return (
            <li key={id}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => setOpen(isOpen ? null : id)}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition ${
                  clickable ? "hover:bg-white/60 cursor-pointer" : "cursor-default"
                } ${stage.status === "pending" ? "opacity-40" : ""}`}
              >
                <Dot status={stage.status} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{meta.title}</span>
                    {meta.lab && (
                      <a
                        href={meta.lab.href}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border border-pine/20 px-1.5 py-px text-[10px] text-pine/55 hover:border-spruce hover:text-spruce"
                      >
                        {meta.lab.label}
                      </a>
                    )}
                  </span>
                  <span className="block truncate text-xs text-pine/55">
                    {stage.headline ?? meta.sub}
                  </span>
                </span>
                {stage.ms !== undefined && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-pine/45">
                    {stage.ms < 1000 ? `${stage.ms}ms` : `${(stage.ms / 1000).toFixed(1)}s`}
                  </span>
                )}
                {clickable && (
                  <span className="shrink-0 text-[10px] text-pine/35">
                    {isOpen ? "hide" : "why"}
                  </span>
                )}
              </button>
              {isOpen && stage.detail && (
                <div className="pl-10 pr-2 pb-1">
                  <Detail detail={stage.detail} />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {totalMs !== undefined && modelMs > 0 && (
        <div className="mt-4 rounded-md border border-pine/15 bg-white/50 p-3">
          <p className="text-xs font-semibold">Where the time went</p>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-pine/10">
            <div
              className="bg-pine/30"
              style={{ width: `${(everythingElse / totalMs) * 100}%` }}
              title={`everything else: ${everythingElse}ms`}
            />
            <div
              className="bg-spruce"
              style={{ width: `${(modelMs / totalMs) * 100}%` }}
              title={`model: ${modelMs}ms`}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-pine/70">
            Your code took <strong>{everythingElse}ms</strong>. The model took{" "}
            <strong>{(modelMs / 1000).toFixed(1)}s</strong>, which is{" "}
            <strong>{Math.round((modelMs / totalMs) * 100)}%</strong> of the
            request. Optimising anything but the model call is optimising the
            wrong thing.
          </p>
        </div>
      )}
    </div>
  );
}
