"use client";

import type { RunState, SseFrame } from "@/lib/explorerWire";

/**
 * What happened between here and the model, drawn as a sequence diagram with time running down.
 *
 * THE RULE THIS DIAGRAM KEEPS. Everything drawn solid was observed: an arrow is an event the route saw, placed at the
 * moment it saw it. Anthropic does not report its internal stages, so the dashed bands are explanations of a gap
 * between two observations ("somewhere in these 400 ms the request was authenticated, validated and queued"), and
 * they are labelled as such. A diagram that drew "tokenizer: 12 ms" would be inventing a number.
 */

const W = 1000;
const TOP = 58;
const LANE_H = 380;
const H = TOP + LANE_H + 60;

const COL = { browser: 90, route: 320, api: 570, model: 790 } as const;

export const FRAME_COLOR: Record<string, string> = {
  message_start: "#5c9a86",
  message_delta: "#5c9a86",
  message_stop: "#5c9a86",
  content_block_start: "#8a9a93",
  content_block_stop: "#8a9a93",
  text_delta: "#1f3d33",
  thinking_delta: "#d9642a",
  signature_delta: "#b45309",
  input_json_delta: "#2563eb",
  ping: "#cbd5e1",
  error: "#e11d48",
};

export const BLOCK_COLOR: Record<string, string> = {
  thinking: "#d9642a",
  redacted_thinking: "#b45309",
  text: "#5c9a86",
  tool_use: "#2563eb",
  server_tool_use: "#7c3aed",
};

export function frameKind(f: SseFrame): string {
  if (f.event === "content_block_delta") return (f.data as { delta?: { type?: string } })?.delta?.type ?? f.event;
  return f.event;
}

const ms = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("en-US")} ms`);
const num = (n: unknown) => (typeof n === "number" ? n.toLocaleString("en-US") : "—");

export function Stats({ run }: { run: RunState }) {
  const sent = run.attempts.at(-1)?.t ?? null;
  const since = (t: number | null) => (t === null || sent === null ? null : t - sent);
  const outTokens = run.usage?.output_tokens;
  const genMs = run.firstDeltaT !== null && run.messageStopT !== null ? run.messageStopT - run.firstDeltaT : null;
  const rate = typeof outTokens === "number" && genMs && genMs > 50 ? Math.round((outTokens / genMs) * 1000) : null;
  const h = run.responseHeaders ?? {};
  const remaining = (name: string) => h[`anthropic-ratelimit-${name}-remaining`];

  const items: [string, string, string][] = [
    ["Time to headers", ms(since(run.headersT)), "Request leaves the route → status line arrives. Everything before generation."],
    ["Time to first token", ms(since(run.firstDeltaT)), "Request leaves → first content_block_delta."],
    ["Total", ms(run.endT), "From the route receiving your click to the last byte."],
    ["Output speed", rate ? `${rate} tok/s` : "—", "output_tokens ÷ time from first delta to message_stop."],
    ["Input tokens", num(run.usage?.input_tokens), "Uncached input, billed at the full rate."],
    ["Cache read", num(run.usage?.cache_read_input_tokens), "Served from cache at 0.1× the input rate."],
    ["Cache write", num(run.usage?.cache_creation_input_tokens), "Written to cache at 1.25× the input rate."],
    ["Output tokens", num(outTokens), "Includes thinking, whether or not it was displayed."],
    ["Network reads", num(run.chunks.length), "Chunks the route read. One often holds several SSE frames."],
    ["SSE frames", `${num(run.frames.length)}${run.pings ? ` (${run.pings} ping)` : ""}`, "Parsed events."],
    ["Cost", run.costUsd === null ? "—" : `$${run.costUsd.toFixed(5)}`, "Priced from usage and the response's model."],
    ["Paid by", run.funding ?? "—", "house: Northwind's key; trial: your free credit; byok: your key."],
  ];

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4 lg:grid-cols-6">
        {items.map(([label, value, why]) => (
          <div key={label} title={why} className="min-w-0">
            <dt className="truncate text-[10px] uppercase tracking-wider text-pine/50">{label}</dt>
            <dd className="truncate font-mono text-[13px] text-pine">{value}</dd>
          </div>
        ))}
      </dl>
      {(h["request-id"] || remaining("requests")) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-pine/60">
          {h["request-id"] && <span>request-id: {h["request-id"]}</span>}
          {remaining("requests") && <span>ratelimit requests remaining: {remaining("requests")}</span>}
          {remaining("input-tokens") && <span>input-tokens remaining: {remaining("input-tokens")}</span>}
          {remaining("output-tokens") && <span>output-tokens remaining: {remaining("output-tokens")}</span>}
        </p>
      )}
    </div>
  );
}

function Actor({ x, title, sub }: { x: number; title: string; sub: string }) {
  return (
    <g>
      <rect x={x - 100} y={6} width={200} height={38} rx={6} fill="#1f3d33" />
      <text x={x} y={22} textAnchor="middle" fontSize={13} fontWeight={600} fill="#f2ede4">
        {title}
      </text>
      <text x={x} y={37} textAnchor="middle" fontSize={10.5} fill="#f2ede4" opacity={0.65}>
        {sub}
      </text>
      <line x1={x} x2={x} y1={TOP - 12} y2={TOP + LANE_H + 6} stroke="#1f3d33" strokeOpacity={0.25} strokeDasharray="3 4" />
    </g>
  );
}

function Arrow({
  x1,
  x2,
  y,
  label,
  color = "#1f3d33",
  dashed = false,
  above = true,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
  color?: string;
  dashed?: boolean;
  above?: boolean;
}) {
  const dir = x2 > x1 ? 1 : -1;
  return (
    <g>
      <line x1={x1} x2={x2 - dir * 6} y1={y} y2={y} stroke={color} strokeWidth={1.6} strokeDasharray={dashed ? "5 4" : undefined} />
      <path d={`M ${x2} ${y} l ${-dir * 8} -4 v 8 z`} fill={color} />
      <text
        x={(x1 + x2) / 2}
        y={above ? y - 5 : y + 13}
        textAnchor="middle"
        fontSize={11}
        fill={color}
        style={{ paintOrder: "stroke", stroke: "#f2ede4", strokeWidth: 3 }}
      >
        {label}
      </text>
    </g>
  );
}

function Band({
  x,
  y1,
  y2,
  color,
  label,
  explained = false,
  width = 26,
  labelSide = "right",
}: {
  x: number;
  y1: number;
  y2: number;
  color: string;
  label: string;
  explained?: boolean;
  width?: number;
  labelSide?: "left" | "right";
}) {
  const h = Math.max(3, y2 - y1);
  return (
    <g>
      <rect
        x={x - width / 2}
        y={y1}
        width={width}
        height={h}
        rx={3}
        fill={color}
        fillOpacity={explained ? 0.12 : 0.55}
        stroke={color}
        strokeDasharray={explained ? "4 3" : undefined}
      />
      <text
        x={labelSide === "right" ? x + width / 2 + 6 : x - width / 2 - 6}
        y={y1 + Math.min(h / 2, 40) + 4}
        textAnchor={labelSide === "right" ? "start" : "end"}
        fontSize={11}
        fill={color}
        fontStyle={explained ? "italic" : undefined}
        style={{ paintOrder: "stroke", stroke: "#f2ede4", strokeWidth: 3 }}
      >
        {label}
      </text>
    </g>
  );
}

export default function RemoteLane({ run, full, cursorT }: { run: RunState; full: RunState; cursorT: number | null }) {
  // The scale comes from the whole run, so scrubbing moves the cursor rather than rescaling the drawing.
  const T = Math.max(full.endT ?? 0, full.chunks.at(-1)?.t ?? 0, full.headersT ?? 0, 1);
  const y = (t: number) => TOP + (Math.min(t, T) / T) * LANE_H;

  const attempt = run.attempts.at(-1);
  const status = run.status;
  const input = run.usage?.input_tokens;
  const cacheRead = run.usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = run.usage?.cache_creation_input_tokens ?? 0;
  const firstBlockT = run.blocks.find(Boolean)?.startT ?? run.firstDeltaT;
  const bodyBytes = attempt?.body ? new TextEncoder().encode(attempt.body).length : 0;
  const frames = run.frames.slice(-600);
  const modelName = String(run.message?.model ?? (attempt?.body ? JSON.parse(attempt.body).model : "the model"));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Sequence diagram of the request">
      <Actor x={COL.browser} title="Your browser" sub="this page" />
      <Actor x={COL.route} title="/api/explorer" sub="Northwind's server + SDK" />
      <Actor x={COL.api} title="api.anthropic.com" sub="POST /v1/messages" />
      <Actor x={COL.model} title="Claude" sub={modelName} />

      <Arrow x1={COL.browser} x2={COL.route} y={y(0) + 2} label="POST (your body)" />

      {run.attempts.map((a) => (
        <Arrow
          key={a.n}
          x1={COL.route}
          x2={COL.api}
          y={y(a.t) + 14}
          label={`${a.n > 1 ? `retry ${a.n - 1} · ` : ""}POST /v1/messages · ${(bodyBytes / 1024).toFixed(1)} kB`}
          color={a.n > 1 ? "#b45309" : "#1f3d33"}
        />
      ))}

      {attempt && (
        <Band
          x={COL.api}
          y1={y(attempt.t) + 16}
          y2={y(run.headersT ?? cursorT ?? attempt.t)}
          color="#1f3d33"
          label="auth · validate · limits · queue"
          explained
          labelSide="left"
          width={18}
        />
      )}

      {attempt && run.messageStartT !== null && input !== undefined && (
        <Band
          x={COL.model}
          y1={y(attempt.t) + 16}
          y2={y(firstBlockT ?? run.messageStartT)}
          color="#5c9a86"
          label={`read the prompt: ${num(input + cacheRead + cacheWrite)} tokens${cacheRead ? ` (${num(cacheRead)} from cache)` : cacheWrite ? ` (${num(cacheWrite)} written to cache)` : ""}`}
          explained
          labelSide="left"
        />
      )}

      {run.blocks.filter(Boolean).map((b) => (
        <Band
          key={b.index}
          x={COL.model}
          y1={y(b.startT)}
          y2={y(b.stopT ?? cursorT ?? b.startT)}
          color={BLOCK_COLOR[b.type] ?? "#475569"}
          label={`content[${b.index}] ${b.type}${b.type === "tool_use" ? ` → ${String(b.block.name)}` : ""}`}
        />
      ))}

      {status !== null && run.headersT !== null && (
        <Arrow
          x1={COL.api}
          x2={COL.route}
          y={y(run.headersT) + 2}
          label={`${status} · ${run.streaming ? "text/event-stream" : "application/json"}`}
          color={status >= 400 ? "#e11d48" : "#1f3d33"}
          above={false}
        />
      )}

      {/* One tick per SSE frame, on both hops: the route forwards each read as it arrives. */}
      {frames.map((f, i) => {
        const kind = frameKind(f);
        const yy = y(f.t);
        const color = FRAME_COLOR[kind] ?? "#475569";
        return (
          <g key={i} opacity={kind === "ping" ? 0.6 : 0.8}>
            <line x1={COL.api - 4} x2={COL.route + 4} y1={yy} y2={yy} stroke={color} strokeWidth={1} />
            <line x1={COL.route - 4} x2={COL.browser + 4} y1={yy} y2={yy} stroke={color} strokeWidth={0.8} strokeOpacity={0.45} />
          </g>
        );
      })}

      {run.messageStartT !== null && (
        <text
          x={COL.route - 10}
          y={y(run.messageStartT) + 14}
          textAnchor="end"
          fontSize={10.5}
          fill="#5c9a86"
          style={{ paintOrder: "stroke", stroke: "#f2ede4", strokeWidth: 3 }}
        >
          message_start: usage so far
        </text>
      )}
      {run.stopReason && run.messageStopT !== null && (
        <text
          x={COL.model - 22}
          y={y(run.messageStopT) + 14}
          textAnchor="end"
          fontSize={11.5}
          fontWeight={600}
          fill="#1f3d33"
          style={{ paintOrder: "stroke", stroke: "#f2ede4", strokeWidth: 3 }}
        >
          stop_reason: {run.stopReason} · {num(run.usage?.output_tokens)} output tokens
        </text>
      )}
      {run.apiError && run.headersT !== null && (
        <text x={COL.route + 10} y={y(run.headersT) + 30} fontSize={11.5} fill="#e11d48" fontWeight={600}>
          {String((run.apiError.body as { error?: { type?: string } })?.error?.type ?? "error")} — no tokens generated
        </text>
      )}
      {run.ended && run.endT !== null && (
        <Arrow
          x1={COL.route}
          x2={COL.browser}
          y={y(run.endT) + 8}
          label={run.ended === "done" ? `done${run.costUsd !== null ? ` · $${run.costUsd.toFixed(5)}` : ""}` : run.ended}
          color={run.ended === "done" ? "#1f3d33" : "#e11d48"}
          above={false}
        />
      )}

      {cursorT !== null && (
        <g>
          <line x1={20} x2={W - 20} y1={y(cursorT)} y2={y(cursorT)} stroke="#d9642a" strokeWidth={1} strokeDasharray="2 3" />
          <text x={W - 20} y={y(cursorT) - 4} textAnchor="end" fontSize={11} fill="#d9642a">
            +{cursorT} ms
          </text>
        </g>
      )}

      <g transform={`translate(20 ${H - 14})`} fontSize={10.5} fill="#1f3d33">
        <text>Solid: observed at the route, placed when it arrived. Dashed: an explanation of the gap between two observations.</text>
        <text x={W - 40} textAnchor="end" opacity={0.6}>
          0 → {T.toLocaleString("en-US")} ms, top to bottom
        </text>
      </g>
    </svg>
  );
}
