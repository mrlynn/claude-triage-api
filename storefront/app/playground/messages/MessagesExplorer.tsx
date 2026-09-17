"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publishMeter, reportAi, type Meter } from "@/lib/accountClient";
import { buildBody, hints, type Body, type ExplorerOptions } from "@/lib/explorerPolicy";
import { presets as buildPresets } from "@/lib/explorerPresets";
import { runDemoTool } from "@/lib/explorerTools";
import { SseParser, envelopeTime, fold, type Envelope, type Recording } from "@/lib/explorerWire";
import OptionsPanel from "./OptionsPanel";
import RemoteLane, { Stats } from "./RemoteLane";
import ResponsePane from "./ResponsePane";
import WirePane from "./WirePane";

/**
 * The Messages API explorer: compose a request, watch it cross the wire, read what came back.
 *
 * ONE LIST OF EVENTS PER TURN, AND A CURSOR INTO IT. A live send appends events as the route emits them; a recording
 * arrives with all of them; the scrubber and replay only move the cursor. Every pane renders `fold(events[0..cursor])`,
 * so nothing on screen can describe a different moment from anything else.
 *
 * A turn is one request. A tool round trip or a follow-up question is a new turn whose body carries the earlier ones in
 * `messages`, because the API is stateless: the conversation is whatever you send.
 */

interface Turn {
  body: Body;
  events: Envelope[];
  source: "live" | "recording";
  running: boolean;
}

const SPEEDS = [0.25, 0.5, 1, 2] as const;

export default function MessagesExplorer({ handbook, recordings }: { handbook: string; recordings: Recording[] }) {
  const presetList = useMemo(() => buildPresets(handbook), [handbook]);
  const [presetId, setPresetId] = useState(presetList[0].id);
  const [options, setOptions] = useState<ExplorerOptions>(presetList[0].options);
  const [focus, setFocus] = useState<string | null>(null);
  const [wireMode, setWireMode] = useState<"draft" | "sent">("draft");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selected, setSelected] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [notice, setNotice] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const turnCount = useRef(0);

  const preset = presetList.find((p) => p.id === presetId);
  const recording = recordings.find((r) => r.id === presetId);
  const { body, schemaError } = useMemo(() => buildBody(options), [options]);
  const hintList = useMemo(() => hints(body), [body]);

  const turn = turns[selected] ?? null;
  const events = useMemo(() => turn?.events ?? [], [turn]);
  const n = cursor === null ? events.length : Math.min(cursor, events.length);
  const full = useMemo(() => fold(events), [events]);
  const run = useMemo(() => (n === events.length ? full : fold(events.slice(0, n))), [events, n, full]);
  const cursorT = useMemo(() => {
    if (cursor === null || !n) return null;
    for (let i = n - 1; i >= 0; i--) {
      const t = envelopeTime(events[i]);
      if (t !== null) return t;
    }
    return 0;
  }, [cursor, n, events]);

  const set = useCallback(<K extends keyof ExplorerOptions>(key: K, value: ExplorerOptions[K]) => {
    setOptions((o) => ({ ...o, [key]: value }));
    setWireMode("draft");
  }, []);

  const append = (index: number, e: Envelope) =>
    setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, events: [...t.events, e] } : t)));

  const finish = (index: number) => setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, running: false } : t)));

  async function send(requestBody: Body) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const index = turnCount.current++;
    setTurns((prev) => [...prev, { body: requestBody, events: [], source: "live", running: true }]);
    setSelected(index);
    setCursor(null);
    setPlaying(false);
    setWireMode("sent");
    setNotice(null);
    const t0 = performance.now();

    try {
      const res = await fetch("/api/explorer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").includes("event-stream")) {
        const data = await res.json().catch(() => ({}));
        reportAi(data);
        append(index, {
          event: "failure",
          data: { t: Math.round(performance.now() - t0), error: data.error, detail: data.detail ?? `HTTP ${res.status}` },
        });
        setNotice(
          `${data.detail ?? `The explorer answered ${res.status}.`}${recording ? " The recorded exchange for this preset still replays." : ""}`,
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseParser();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of parser.push(decoder.decode(value, { stream: true }), 0)) {
          const e = { event: frame.event, data: frame.data } as Envelope;
          if (e.event === "meter") publishMeter(e.data as Meter);
          if (e.event === "failure") reportAi(e.data);
          append(index, e);
        }
      }
    } catch {
      // The Stop button, or a newer send. The route hears the same abort and reports what was billed.
      if (controller.signal.aborted) append(index, { event: "cancelled", data: { t: Math.round(performance.now() - t0) } });
    } finally {
      finish(index);
    }
  }

  function replay(rec: Recording) {
    abort.current?.abort();
    const start = turnCount.current;
    turnCount.current += rec.turns.length;
    setTurns((prev) => [
      ...prev,
      ...rec.turns.map((t) => ({ body: t.body, events: t.events, source: "recording" as const, running: false })),
    ]);
    setSelected(start);
    setCursor(0);
    setPlaying(true);
    setWireMode("sent");
    setNotice(null);
  }

  // Replay: advance a clock and move the cursor past every event stamped before it. Real gaps, scaled.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let clock = cursorT ?? 0;
    const tick = (now: number) => {
      clock += (now - last) * speed;
      last = now;
      let next = 0;
      let lastT = 0;
      for (const e of events) {
        const t = envelopeTime(e) ?? lastT;
        if (t > clock) break;
        lastT = t;
        next++;
      }
      if (next >= events.length) {
        setCursor(null);
        setPlaying(false);
        return;
      }
      setCursor(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // cursorT is read once when play starts; including it would restart the clock every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, events]);

  const priorMessages = (turn?.body.messages as ExplorerOptions["messages"]) ?? [];
  const content = (full.message?.content as Record<string, unknown>[] | undefined) ?? [];
  const toolUses = content.filter((b) => b.type === "tool_use");
  const settled = !!turn && !turn.running && cursor === null && full.ended === "done";

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="rounded-lg border border-pine/15 bg-white/40 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-pine/50">Start from</span>
          {presetList.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPresetId(p.id);
                setOptions(p.options);
                setWireMode("draft");
              }}
              className={`rounded-full border px-3 py-1 text-[12px] ${
                presetId === p.id ? "border-pine bg-pine text-bone" : "border-pine/20 bg-white/60 text-pine hover:border-pine/50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset && (
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl text-[13px] leading-relaxed text-pine/75">
              <span className="font-semibold text-pine">Watch for: </span>
              {preset.watch}
            </p>
            {recording && (
              <button
                type="button"
                onClick={() => replay(recording)}
                className="shrink-0 rounded border border-pine/25 bg-white/70 px-3 py-1 text-[12px] text-pine hover:border-pine/60"
                title={`Recorded ${recording.recordedAt.slice(0, 10)} from this route. Costs nothing.`}
              >
                ▶ Replay a recorded run
              </button>
            )}
          </div>
        )}
      </div>

      {/* Compose + wire */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section className="flex max-h-[760px] min-h-0 flex-col rounded-lg border border-pine/15 bg-white/40">
          <h2 className="border-b border-pine/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-pine/60">
            1 · Compose
          </h2>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <OptionsPanel options={options} set={set} onFocus={setFocus} hints={hintList} schemaError={schemaError} />
          </div>
          <div className="flex items-center gap-2 border-t border-pine/10 p-3">
            <button
              type="button"
              disabled={!!schemaError || !!turn?.running}
              onClick={() => send(body)}
              className="flex-1 rounded bg-ember px-3 py-2 text-sm font-semibold text-bone hover:bg-ember/90 disabled:opacity-50"
            >
              {turn?.running ? "Streaming…" : "Send request"}
            </button>
            {turn?.running && (
              <button
                type="button"
                onClick={() => abort.current?.abort()}
                className="rounded border border-pine/30 px-3 py-2 text-sm text-pine hover:bg-pine/5"
                title="Aborts the fetch. The route passes the abort to the API, and bills what streamed before it."
              >
                Stop
              </button>
            )}
          </div>
        </section>

        <section className="flex h-[760px] min-h-0 flex-col gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-pine/60">2 · On the wire</h2>
          <div className="min-h-0 flex-1">
            <WirePane
              body={body}
              focus={focus}
              run={turn ? run : null}
              sentBody={turn?.body ?? null}
              mode={wireMode}
              onMode={setWireMode}
            />
          </div>
        </section>
      </div>

      {notice && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>}

      {/* Turns and the scrubber */}
      <div className="sticky top-0 z-10 rounded-lg border border-pine/15 bg-bone/95 p-2 shadow-sm backdrop-blur">
        {turns.length === 0 ? (
          <p className="px-1 text-[13px] text-pine/60">
            Send the request, or replay a recorded run, and everything below fills in as the bytes arrive.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-pine/50">Turns</span>
              {turns.map((t, i) => {
                const s = i === selected ? run : null;
                const label = `${i + 1} · ${t.source === "recording" ? "recorded" : "live"}${t.running ? " · streaming" : ""}${s?.stopReason ? ` · ${s.stopReason}` : ""}`;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelected(i);
                      setCursor(null);
                      setPlaying(false);
                      setWireMode("sent");
                    }}
                    className={`rounded px-2 py-0.5 font-mono text-[11px] ${
                      i === selected ? "bg-pine text-bone" : "bg-white/60 text-pine hover:bg-white"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-7 rounded border border-pine/20 text-pine hover:bg-white"
                onClick={() => {
                  setPlaying(false);
                  setCursor(Math.max(0, n - 1));
                }}
                aria-label="Step back one event"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={!!turn?.running || events.length === 0}
                className="w-16 rounded bg-pine px-2 text-[12px] text-bone disabled:opacity-40"
                onClick={() => {
                  if (playing) setPlaying(false);
                  else {
                    if (cursor === null) setCursor(0);
                    setPlaying(true);
                  }
                }}
              >
                {playing ? "❚❚ Pause" : "▶ Replay"}
              </button>
              <button
                type="button"
                className="w-7 rounded border border-pine/20 text-pine hover:bg-white"
                onClick={() => {
                  setPlaying(false);
                  setCursor(n + 1 >= events.length ? null : n + 1);
                }}
                aria-label="Step forward one event"
              >
                ›
              </button>
              <input
                type="range"
                min={0}
                max={events.length}
                value={n}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPlaying(false);
                  setCursor(v >= events.length ? null : v);
                }}
                className="min-w-0 flex-1 accent-[#d9642a]"
                aria-label="Scrub through the response"
              />
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
                className="rounded border border-pine/20 bg-white/70 px-1 text-[12px]"
                aria-label="Replay speed"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
              <span className="w-44 truncate text-right font-mono text-[11px] text-pine/70">
                {n}/{events.length}
                {n > 0 ? ` · ${events[n - 1].event}` : ""}
                {cursorT !== null ? ` · +${cursorT}ms` : ""}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Remote */}
      <section className="space-y-3 rounded-lg border border-pine/15 bg-white/40 p-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-pine/60">
          3 · What happened between here and the model
        </h2>
        {turn ? (
          <>
            <Stats run={run} />
            <RemoteLane run={run} full={full} cursorT={cursorT} />
          </>
        ) : (
          <p className="py-10 text-center text-sm text-pine/50">Nothing sent yet.</p>
        )}
      </section>

      {/* Response */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-pine/60">4 · What came back</h2>
        {turn ? (
          <div className="flex max-h-[600px] min-h-[260px] flex-col">
            <ResponsePane key={selected} run={run} full={full} />
          </div>
        ) : (
          <p className="rounded-lg bg-pine py-10 text-center text-sm text-bone/60">The stream appears here.</p>
        )}
      </section>

      {settled && full.stopReason === "tool_use" && toolUses.length > 0 && (
        <ToolRoundTrip
          key={selected}
          toolUses={toolUses}
          onSend={(results) => {
            const messages: ExplorerOptions["messages"] = [
              ...priorMessages,
              { role: "assistant", content },
              { role: "user", content: results },
            ];
            setOptions((o) => ({ ...o, messages }));
            void send({ ...turn!.body, messages });
          }}
        />
      )}

      {settled && full.stopReason !== "tool_use" && full.message && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-pine/15 bg-white/40 p-3 text-sm text-pine/80">
          <span>
            The API kept nothing. To go on, send the whole conversation back: this reply as an{" "}
            <code className="font-mono text-[12px]">assistant</code> message, then your next question.
          </span>
          <button
            type="button"
            className="rounded border border-pine/30 bg-white/70 px-3 py-1 text-[12px] text-pine hover:border-pine"
            onClick={() => {
              set("messages", [...priorMessages, { role: "assistant", content }, { role: "user", content: "" }]);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Continue the conversation
          </button>
        </div>
      )}
    </div>
  );
}

function ToolRoundTrip({
  toolUses,
  onSend,
}: {
  toolUses: Record<string, unknown>[];
  onSend: (results: Record<string, unknown>[]) => void;
}) {
  const [results, setResults] = useState(() =>
    toolUses.map((b) => ({ id: String(b.id), name: String(b.name), input: b.input, ...runDemoTool(String(b.name), b.input) })),
  );

  return (
    <section className="space-y-3 rounded-lg border-2 border-dashed border-sky-600/50 bg-sky-50/60 p-4">
      <div>
        <h2 className="font-display text-lg font-bold text-pine">Your code runs here</h2>
        <p className="max-w-3xl text-sm text-pine/75">
          The model asked for {toolUses.length === 1 ? "a tool" : `${toolUses.length} tools`} and stopped. Anthropic ran
          nothing. Whatever you put below is what the model will believe the tool returned. Edit it, or mark it an error,
          and see what the model does with that.
        </p>
      </div>
      {results.map((r, i) => (
        <div key={r.id} className="rounded border border-pine/15 bg-white/70 p-2">
          <p className="font-mono text-[12px] text-pine">
            {r.name}({JSON.stringify(r.input)}) <span className="text-pine/40">tool_use_id {r.id}</span>
          </p>
          <textarea
            className="mt-1 h-28 w-full rounded border border-pine/20 bg-white p-2 font-mono text-[12px]"
            value={r.content}
            onChange={(e) => setResults((prev) => prev.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))}
          />
          <label className="flex items-center gap-2 text-[12px] text-pine/80">
            <input
              type="checkbox"
              checked={r.is_error}
              onChange={(e) => setResults((prev) => prev.map((x, j) => (j === i ? { ...x, is_error: e.target.checked } : x)))}
            />
            is_error
          </label>
        </div>
      ))}
      <button
        type="button"
        className="rounded bg-ember px-4 py-2 text-sm font-semibold text-bone hover:bg-ember/90"
        onClick={() =>
          // Every result goes in ONE user message. Splitting parallel results across messages teaches the model to stop
          // calling tools in parallel.
          onSend(
            results.map((r) => ({
              type: "tool_result",
              tool_use_id: r.id,
              content: r.content,
              ...(r.is_error ? { is_error: true } : {}),
            })),
          )
        }
      >
        Send tool_result{results.length > 1 ? "s" : ""} back →
      </button>
    </section>
  );
}
