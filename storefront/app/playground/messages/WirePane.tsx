"use client";

import { useState } from "react";
import { snippets, type Body } from "@/lib/explorerPolicy";
import { byteLength, type RunState } from "@/lib/explorerWire";
import JsonView from "./JsonView";

/**
 * What goes over the wire. Before a send, the body on screen and the headers the SDK will add. After a send, the
 * request the route actually captured: the `x-stainless-*` headers, the retry count, the exact bytes.
 */

type Tab = "http" | "typescript" | "python" | "curl";

const TABS: [Tab, string][] = [
  ["http", "HTTP"],
  ["typescript", "TypeScript"],
  ["python", "Python"],
  ["curl", "curl"],
];

const PREDICTED: Record<string, string> = {
  host: "api.anthropic.com",
  "x-api-key": "sk-ant-…•••• (added on the server)",
  "anthropic-version": "2023-06-01",
  "content-type": "application/json",
  accept: "application/json",
};

function HeaderList({ headers }: { headers: Record<string, string> }) {
  return (
    <div className="font-mono text-[12px] leading-[1.55]">
      {Object.entries(headers).map(([k, v]) => (
        <div key={k} className="break-all px-2">
          <span className={k.startsWith("anthropic") || k === "x-api-key" ? "text-amber-300" : "text-sky-200"}>{k}</span>
          <span className="text-bone/50">: </span>
          <span className="text-bone/85">{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function WirePane({
  body,
  focus,
  run,
  sentBody,
  mode,
  onMode,
}: {
  body: Body;
  focus: string | null;
  run: RunState | null;
  /** The body of the selected turn, when it was sent. The form may have moved on since. */
  sentBody: Body | null;
  /** The draft on the form, or what the selected turn actually sent. Editing the form switches back to the draft. */
  mode: "draft" | "sent";
  onMode: (mode: "draft" | "sent") => void;
}) {
  const [tab, setTab] = useState<Tab>("http");
  const [count, setCount] = useState<{ state: "idle" | "busy" } | { tokens: number; ms: number } | { error: string }>({
    state: "idle",
  });

  const sent = mode === "sent" && !!sentBody;
  const attempt = sent ? (run?.attempts.at(-1) ?? null) : null;
  const shown = attempt?.body ? (JSON.parse(attempt.body) as Body) : sent && sentBody ? sentBody : body;
  const bytes = attempt?.body ? byteLength(attempt.body) : byteLength(JSON.stringify(shown));
  const headers = attempt
    ? Object.fromEntries(Object.entries(attempt.headers).filter(([k]) => k !== "content-length"))
    : { ...PREDICTED, ...(body.stream ? { accept: "text/event-stream" } : {}) };
  const url = attempt ? new URL(attempt.url) : null;
  const code = tab === "http" ? null : snippets(shown)[tab];

  async function preflight() {
    setCount({ state: "busy" });
    try {
      const res = await fetch("/api/explorer/count", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (typeof data.input_tokens === "number") setCount({ tokens: data.input_tokens, ms: data.ms });
      else setCount({ error: data.body?.error?.message ?? data.detail ?? `HTTP ${res.status}` });
    } catch {
      setCount({ error: "Preflight did not answer." });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-pine text-bone shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-bone/10 px-2 py-1.5">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded px-2 py-0.5 text-[12px] ${tab === id ? "bg-bone/15 text-bone" : "text-bone/60 hover:text-bone"}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-2 flex overflow-hidden rounded border border-bone/20 text-[11px]">
          {(["draft", "sent"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={m === "sent" && !sentBody}
              onClick={() => onMode(m)}
              className={`px-2 py-0.5 disabled:opacity-40 ${mode === m ? "bg-ember text-bone" : "text-bone/70 hover:bg-bone/10"}`}
            >
              {m === "draft" ? "Draft" : "Sent"}
            </button>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-bone/60">
          {"tokens" in count ? (
            <span title={`count_tokens answered in ${count.ms} ms`}>
              <b className="text-amber-300">{count.tokens.toLocaleString("en-US")}</b> input tokens
            </span>
          ) : "error" in count ? (
            <span className="text-rose-300" title={count.error}>
              count failed
            </span>
          ) : null}
          <button
            type="button"
            onClick={preflight}
            disabled={"state" in count && count.state === "busy"}
            className="rounded border border-bone/20 px-2 py-0.5 text-bone/80 hover:bg-bone/10 disabled:opacity-50"
            title="POST /v1/messages/count_tokens: free, and the exact number the request will bill as input."
          >
            {"state" in count && count.state === "busy" ? "Counting…" : "Preflight: count tokens"}
          </button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-2">
        {tab === "http" ? (
          <>
            <p className="px-2 font-mono text-[12px]">
              <span className="font-bold text-ember">POST</span>{" "}
              <span className="text-bone">{url ? url.pathname + url.search : "/v1/messages"}</span>{" "}
              <span className="text-bone/50">HTTP/1.1</span>
              {attempt && attempt.n > 1 && (
                <span className="ml-2 rounded bg-amber-400/20 px-1 text-[10px] text-amber-200">attempt {attempt.n}</span>
              )}
            </p>
            {attempt && url && <HeaderList headers={{ host: url.host }} />}
            <HeaderList headers={headers} />
            <div className="px-2 font-mono text-[12px]">
              <span className="text-sky-200">content-length</span>
              <span className="text-bone/50">: </span>
              <span className="text-bone/85">{bytes}</span>
            </div>
            <p className="mt-2 border-t border-bone/10 px-2 pt-1 text-[10px] uppercase tracking-wider text-bone/40">
              {attempt ? "Body, as captured leaving the server" : sent ? "Body sent" : "Draft body: hover an option to find it"}
            </p>
            <JsonView value={shown} focus={sent ? null : focus} />
          </>
        ) : (
          <pre className="whitespace-pre-wrap break-words px-3 font-mono text-[12px] leading-[1.55] text-bone/90">{code}</pre>
        )}
      </div>
    </div>
  );
}
