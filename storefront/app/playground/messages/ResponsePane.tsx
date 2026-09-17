"use client";

import { useEffect, useRef, useState } from "react";
import type { RunState, SseFrame } from "@/lib/explorerWire";
import JsonView from "./JsonView";
import { BLOCK_COLOR, FRAME_COLOR, frameKind } from "./RemoteLane";

/**
 * What came back, three ways: the bytes, the blocks they build, and the message they add up to.
 *
 * The three tabs are the same data at three levels of assembly. The Raw tab is what `curl --no-buffer` prints; the
 * Blocks tab is what an SDK's event handlers see; the Message tab is what `finalMessage()` returns. Reading them side
 * by side is how you learn which level your own code should work at.
 */

type Tab = "raw" | "blocks" | "message" | "headers";

const FRAME_TEXT: Record<string, string> = {
  message_start: "text-emerald-300",
  message_delta: "text-emerald-300",
  message_stop: "text-emerald-300",
  content_block_start: "text-slate-300",
  content_block_stop: "text-slate-300",
  text_delta: "text-bone",
  thinking_delta: "text-orange-300",
  signature_delta: "text-amber-400",
  input_json_delta: "text-sky-300",
  ping: "text-bone/40",
  error: "text-rose-300",
};

function RawFrames({ run }: { run: RunState }) {
  const [wide, setWide] = useState<number | null>(null);

  if (!run.streaming) {
    return (
      <div className="space-y-2 px-3">
        <p className="text-[12px] text-bone/60">
          {run.status === null
            ? "Nothing yet. A non-streaming response arrives in one piece, after generation has finished."
            : `One body, ${run.chunks.reduce((n, c) => n + c.bytes, 0).toLocaleString("en-US")} bytes in ${run.chunks.length} network read${run.chunks.length === 1 ? "" : "s"}. No events: there was nothing to watch.`}
        </p>
        {run.body !== null && <JsonView value={run.body} />}
        {run.apiError && <JsonView value={run.apiError.body} />}
      </div>
    );
  }

  return (
    <div className="font-mono text-[12px] leading-[1.5]">
      {run.frames.map((f: SseFrame, i) => {
        const kind = frameKind(f);
        const newChunk = i === 0 || run.frames[i - 1]?.chunk !== f.chunk;
        const data = typeof f.data === "string" ? f.data : JSON.stringify(f.data);
        const open = wide === i;
        return (
          <div key={i}>
            {newChunk && (
              <div className="mt-1 flex items-center gap-2 px-3 text-[10px] text-bone/30">
                <span className="h-px flex-1 bg-bone/10" />
                read #{f.chunk + 1} · +{f.t} ms
                <span className="h-px flex-1 bg-bone/10" />
              </div>
            )}
            <button
              type="button"
              onClick={() => setWide(open ? null : i)}
              className={`block w-full px-3 text-left hover:bg-bone/5 ${i === run.frames.length - 1 ? "bg-ember/15" : ""}`}
            >
              <span className="inline-block w-16 text-right text-bone/35">+{f.t}</span>{" "}
              <span className="text-bone/45">event:</span> <span className={FRAME_TEXT[kind] ?? "text-bone"}>{f.event}</span>
              <br />
              <span className="inline-block w-16" /> <span className="text-bone/45">data:</span>{" "}
              <span className={`${open ? "whitespace-pre-wrap break-all" : ""} text-bone/80`}>
                {open ? JSON.stringify(f.data, null, 2) : data.length > 150 ? `${data.slice(0, 150)}…` : data}
              </span>
            </button>
          </div>
        );
      })}
      {run.apiError && (
        <div className="px-3 pt-2">
          <p className="text-rose-300">HTTP {run.apiError.status}: an error before any event</p>
          <JsonView value={run.apiError.body} />
        </div>
      )}
    </div>
  );
}

function Blocks({ run, T }: { run: RunState; T: number }) {
  const lanes = run.blocks.filter(Boolean);
  if (!lanes.length) {
    return <p className="px-3 text-[12px] text-bone/60">No content blocks yet.</p>;
  }
  return (
    <div className="space-y-3 px-3">
      {lanes.map((lane) => {
        const color = BLOCK_COLOR[lane.type] ?? "#94a3b8";
        const chars = lane.deltas.reduce((n, d) => n + d.size, 0);
        const b = lane.block;
        return (
          <div key={lane.index} className="rounded border border-bone/10 p-2">
            <div className="flex flex-wrap items-baseline gap-x-3 text-[12px]">
              <span className="font-mono font-semibold" style={{ color }}>
                content[{lane.index}] · {lane.type}
              </span>
              <span className="text-bone/50">
                {lane.deltas.length} deltas · {chars.toLocaleString("en-US")} chars ·{" "}
                {lane.stopT === null ? "streaming…" : `${lane.stopT - lane.startT} ms`}
              </span>
            </div>
            {/* The lane: where in the whole response this block's deltas landed. */}
            <div className="relative my-2 h-4 rounded bg-bone/5">
              <div
                className="absolute top-0 h-4 rounded"
                style={{
                  left: `${(lane.startT / T) * 100}%`,
                  width: `${Math.max(0.4, (((lane.stopT ?? lane.deltas.at(-1)?.t ?? lane.startT) - lane.startT) / T) * 100)}%`,
                  background: color,
                  opacity: 0.25,
                }}
              />
              {lane.deltas.map((d, i) => (
                <span
                  key={i}
                  className="absolute top-0.5 h-3 w-px"
                  style={{ left: `${(d.t / T) * 100}%`, background: FRAME_COLOR[d.kind] ?? color }}
                  title={`${d.kind} +${d.t} ms, ${d.size} chars`}
                />
              ))}
            </div>
            {lane.type === "text" && (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-bone">{String(b.text ?? "")}</p>
            )}
            {lane.type === "thinking" && (
              <>
                <p className="whitespace-pre-wrap text-[13px] italic leading-relaxed text-orange-200">
                  {String(b.thinking ?? "") ||
                    "(empty: display is omitted, so the reasoning happened and was billed, but its text is not returned)"}
                </p>
                {typeof b.signature === "string" && b.signature && (
                  <p className="mt-1 break-all font-mono text-[10px] text-amber-400/70">
                    signature: {b.signature.slice(0, 80)}… ({b.signature.length} chars; send back unchanged)
                  </p>
                )}
              </>
            )}
            {(lane.type === "tool_use" || lane.type === "server_tool_use") && (
              <div className="font-mono text-[12px]">
                <p className="text-sky-300">
                  {String(b.name)} <span className="text-bone/40">id {String(b.id)}</span>
                </p>
                <p className="mt-1 text-bone/50">partial_json so far:</p>
                <p className="whitespace-pre-wrap break-all text-bone">{lane.partialJson || "(nothing yet)"}</p>
                <p className={`mt-1 text-[11px] ${lane.jsonComplete ? "text-emerald-300" : "text-amber-300"}`}>
                  {lane.jsonComplete ? "✓ parses as JSON" : "… not valid JSON yet. Don't parse until content_block_stop."}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ResponsePane({ run, full }: { run: RunState; full: RunState }) {
  const [tab, setTab] = useState<Tab>("raw");
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  // Follow the stream while the reader is at the bottom; stop following the moment they scroll up to read.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [run.frames.length, tab]);
  const T = Math.max(full.endT ?? 0, full.chunks.at(-1)?.t ?? 0, 1);
  const message = run.message ?? (run.apiError?.body as Record<string, unknown> | undefined) ?? null;

  const tabs: [Tab, string][] = [
    ["raw", run.streaming ? `Raw SSE · ${run.frames.length}` : "Raw body"],
    ["blocks", `Blocks · ${run.blocks.filter(Boolean).length}`],
    ["message", run.apiError ? "Error" : "Message"],
    ["headers", "Headers"],
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-pine text-bone shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-bone/10 px-2 py-1.5">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded px-2 py-0.5 text-[12px] ${tab === id ? "bg-bone/15 text-bone" : "text-bone/60 hover:text-bone"}`}
          >
            {label}
          </button>
        ))}
        {run.status !== null && (
          <span className={`ml-auto font-mono text-[12px] ${run.status >= 400 ? "text-rose-300" : "text-emerald-300"}`}>
            HTTP {run.status}
            {run.stopReason ? ` · stop_reason: ${run.stopReason}` : ""}
          </span>
        )}
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-auto py-2"
      >
        {tab === "raw" && <RawFrames run={run} />}
        {tab === "blocks" && <Blocks run={run} T={T} />}
        {tab === "message" &&
          (message ? (
            <JsonView value={message} />
          ) : (
            <p className="px-3 text-[12px] text-bone/60">No message_start yet.</p>
          ))}
        {tab === "headers" &&
          (run.responseHeaders ? (
            <div className="font-mono text-[12px] leading-[1.55]">
              {Object.entries(run.responseHeaders).map(([k, v]) => (
                <div key={k} className="break-all px-3">
                  <span className={k.startsWith("anthropic") || k === "request-id" ? "text-amber-300" : "text-sky-200"}>{k}</span>
                  <span className="text-bone/50">: </span>
                  <span className="text-bone/85">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 text-[12px] text-bone/60">No response headers yet.</p>
          ))}
      </div>
    </div>
  );
}
