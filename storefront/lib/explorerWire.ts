/**
 * What the Messages API explorer knows about one request, rebuilt from the events that describe it.
 *
 * WHY RAW BYTES AND NOT SDK EVENTS. The SDK's stream iterator is what an application should use, and it is not what
 * came over the connection: it drops `ping` frames and hides where one network read ended and the next began. This
 * page is about the connection, so `/api/explorer` forwards each chunk exactly as read, and this file parses it. The
 * route runs the same parser to find the usage it bills.
 *
 * WHY A FOLD. Everything on the page (the lane diagram, the block lanes, the assembled message) is
 * `fold(events.slice(0, n))`. A live run, a recording and a scrubbed position are the same computation over a longer
 * or shorter list, so none of them can disagree about what the stream said at frame n.
 *
 * Pure, no `server-only`: the browser and `node:test` both load it.
 */

// ---- the envelope: what /api/explorer sends the browser -----------------------------------------------------------

export type Envelope =
  | { event: "start"; data: { t: number; funding: string; sdk: string } }
  | {
      event: "attempt";
      data: { t: number; n: number; method: string; url: string; headers: Record<string, string>; body: string | null };
    }
  | { event: "headers"; data: { t: number; status: number; headers: Record<string, string> } }
  | { event: "wire"; data: { t: number; chunk: string } }
  | { event: "api_error"; data: { t: number; status: number; body: unknown } }
  | { event: "meter"; data: unknown }
  | { event: "done"; data: { t: number; model: string; cost_usd: number } }
  | { event: "failure"; data: { t?: number; error?: string; detail?: string } }
  | { event: "cancelled"; data: { t: number } };

export type EnvelopeName = Envelope["event"];

/** Every envelope carries `t`, milliseconds since the route received the request, except a meter. */
export const envelopeTime = (e: Envelope): number | null =>
  typeof (e.data as { t?: unknown })?.t === "number" ? (e.data as { t: number }).t : null;

// ---- SSE ------------------------------------------------------------------------------------------------------------

export interface SseFrame {
  /** Arrival time of the chunk that completed this frame. */
  t: number;
  event: string;
  data: unknown;
  raw: string;
  /** Which network read completed it. Several frames often arrive in one read. */
  chunk: number;
}

/**
 * The part of the SSE spec the Messages API uses: `event:` and `data:` lines, frames separated by a blank line.
 * Anything after the last blank line is a partial frame and waits for the next chunk.
 */
export class SseParser {
  private buffer = "";
  private chunks = 0;

  push(text: string, t: number): SseFrame[] {
    this.buffer += text.replace(/\r\n/g, "\n");
    const chunk = this.chunks++;
    const parts = this.buffer.split("\n\n");
    this.buffer = parts.pop() ?? "";
    const frames: SseFrame[] = [];
    for (const raw of parts) {
      if (!raw.trim()) continue;
      let event = "message";
      const data: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      let parsed: unknown = data.join("\n");
      try {
        parsed = JSON.parse(parsed as string);
      } catch {
        // Not JSON. Kept as text so the Raw tab still shows it.
      }
      frames.push({ t, event, data: parsed, raw, chunk });
    }
    return frames;
  }

  /** What never ended in a blank line. For a non-streaming call, that is the whole JSON body. */
  rest(): string {
    return this.buffer;
  }
}

// ---- the message being assembled ------------------------------------------------------------------------------------

export type BlockKind = "text" | "thinking" | "redacted_thinking" | "tool_use" | "server_tool_use" | string;

export interface BlockLane {
  index: number;
  type: BlockKind;
  startT: number;
  stopT: number | null;
  /** One entry per delta: when it arrived, what kind, and how many characters it added. */
  deltas: { t: number; kind: string; size: number }[];
  /** The block as it stands at this point in the stream. */
  block: Record<string, unknown>;
  /** tool_use only: the raw `partial_json` so far, and whether it parses yet. */
  partialJson?: string;
  jsonComplete?: boolean;
}

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  [key: string]: unknown;
}

export interface WireState {
  message: Record<string, unknown> | null;
  blocks: BlockLane[];
  usage: Usage | null;
  stopReason: string | null;
  error: unknown;
  frames: SseFrame[];
  pings: number;
  messageStartT: number | null;
  firstDeltaT: number | null;
  firstTextT: number | null;
  messageStopT: number | null;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Every field any Messages API stream event carries. Each event uses a few; the switch below knows which. */
interface StreamEventData {
  index: number;
  message: Record<string, unknown> & { usage?: Usage };
  content_block: Record<string, unknown> & { type: string };
  delta: {
    type: string;
    text: string;
    thinking: string;
    signature: string;
    partial_json: string;
    citation?: unknown;
    stop_reason?: string | null;
  };
  usage?: Record<string, unknown>;
  error?: unknown;
}

/** Applies Messages API stream events to a message, the way the SDK's own accumulator does. */
export class MessageAccumulator {
  state: WireState = {
    message: null,
    blocks: [],
    usage: null,
    stopReason: null,
    error: null,
    frames: [],
    pings: 0,
    messageStartT: null,
    firstDeltaT: null,
    firstTextT: null,
    messageStopT: null,
  };

  apply(frame: SseFrame): void {
    const s = this.state;
    s.frames.push(frame);
    const d = frame.data as StreamEventData;
    switch (frame.event) {
      case "ping":
        s.pings++;
        return;
      case "error":
        s.error = d?.error ?? d;
        return;
      case "message_start": {
        s.message = clone(d.message);
        (s.message as Record<string, unknown>).content = [];
        s.usage = clone(d.message.usage ?? null);
        s.messageStartT = frame.t;
        return;
      }
      case "content_block_start": {
        const block = clone(d.content_block);
        const lane: BlockLane = { index: d.index, type: block.type, startT: frame.t, stopT: null, deltas: [], block };
        if (block.type === "tool_use" || block.type === "server_tool_use") {
          lane.partialJson = "";
          lane.jsonComplete = false;
        }
        s.blocks[d.index] = lane;
        return;
      }
      case "content_block_delta": {
        const lane = s.blocks[d.index];
        if (!lane) return;
        const delta = d.delta;
        let size = 0;
        if (delta.type === "text_delta") {
          lane.block.text = String(lane.block.text ?? "") + delta.text;
          size = delta.text.length;
          s.firstTextT ??= frame.t;
        } else if (delta.type === "thinking_delta") {
          lane.block.thinking = String(lane.block.thinking ?? "") + delta.thinking;
          size = delta.thinking.length;
        } else if (delta.type === "signature_delta") {
          lane.block.signature = delta.signature;
          size = delta.signature.length;
        } else if (delta.type === "input_json_delta") {
          lane.partialJson = (lane.partialJson ?? "") + delta.partial_json;
          size = delta.partial_json.length;
          try {
            lane.block.input = JSON.parse(lane.partialJson);
            lane.jsonComplete = true;
          } catch {
            lane.jsonComplete = false;
          }
        } else if (delta.type === "citations_delta") {
          const list = (lane.block.citations as unknown[]) ?? [];
          list.push(delta.citation);
          lane.block.citations = list;
        }
        s.firstDeltaT ??= frame.t;
        lane.deltas.push({ t: frame.t, kind: delta.type, size });
        return;
      }
      case "content_block_stop": {
        const lane = s.blocks[d.index];
        if (!lane) return;
        lane.stopT = frame.t;
        if (lane.partialJson !== undefined && lane.partialJson === "") lane.block.input = {};
        return;
      }
      case "message_delta": {
        if (s.message) {
          Object.assign(s.message, d.delta);
          s.stopReason = d.delta?.stop_reason ?? s.stopReason;
        }
        // The delta's usage is cumulative. Fields it leaves null keep what message_start said.
        for (const [k, v] of Object.entries(d.usage ?? {})) {
          if (v !== null && v !== undefined) (s.usage ??= {})[k] = v;
        }
        if (s.message) (s.message as Record<string, unknown>).usage = clone(s.usage);
        return;
      }
      case "message_stop":
        s.messageStopT = frame.t;
        return;
    }
  }

  /** Content is rebuilt once, at the end, rather than on every delta: a fold runs on every scrub. */
  finish(): WireState {
    if (this.state.message) this.state.message.content = this.state.blocks.filter(Boolean).map((l) => clone(l.block));
    return this.state;
  }
}

// ---- the whole run ----------------------------------------------------------------------------------------------------

export interface RunState extends WireState {
  funding: string | null;
  sdk: string | null;
  attempts: Extract<Envelope, { event: "attempt" }>["data"][];
  status: number | null;
  responseHeaders: Record<string, string> | null;
  headersT: number | null;
  chunks: { t: number; bytes: number; frames: number }[];
  /** A non-streaming response, or an error body: the JSON that arrived in one piece. */
  body: unknown;
  apiError: { status: number; body: unknown } | null;
  gate: { error?: string; detail?: string } | null;
  costUsd: number | null;
  model: string | null;
  endT: number | null;
  ended: "done" | "cancelled" | "failure" | null;
  streaming: boolean;
}

export function fold(events: readonly Envelope[]): RunState {
  const acc = new MessageAccumulator();
  const parser = new SseParser();
  const run: Omit<RunState, keyof WireState> = {
    funding: null,
    sdk: null,
    attempts: [],
    status: null,
    responseHeaders: null,
    headersT: null,
    chunks: [],
    body: null,
    apiError: null,
    gate: null,
    costUsd: null,
    model: null,
    endT: null,
    ended: null,
    streaming: false,
  };

  for (const e of events) {
    switch (e.event) {
      case "start":
        run.funding = e.data.funding;
        run.sdk = e.data.sdk;
        break;
      case "attempt":
        run.attempts.push(e.data);
        break;
      case "headers":
        run.status = e.data.status;
        run.responseHeaders = e.data.headers;
        run.headersT = e.data.t;
        run.streaming = (e.data.headers["content-type"] ?? "").includes("event-stream");
        break;
      case "wire": {
        const frames = parser.push(e.data.chunk, e.data.t);
        run.chunks.push({ t: e.data.t, bytes: byteLength(e.data.chunk), frames: frames.length });
        for (const f of frames) acc.apply(f);
        break;
      }
      case "api_error":
        run.apiError = { status: e.data.status, body: e.data.body };
        run.endT = e.data.t;
        break;
      case "done":
        run.costUsd = e.data.cost_usd;
        run.model = e.data.model;
        run.endT = e.data.t;
        run.ended = "done";
        break;
      case "cancelled":
        run.endT = e.data.t;
        run.ended = "cancelled";
        break;
      case "failure":
        run.gate = e.data;
        run.endT = e.data.t ?? run.endT;
        run.ended = "failure";
        break;
    }
  }

  // A non-streaming body never contains a blank line, so it is all still in the buffer.
  if (!run.streaming && parser.rest().trim()) {
    try {
      run.body = JSON.parse(parser.rest());
    } catch {
      run.body = parser.rest();
    }
  }
  if (run.apiError) run.ended = run.ended ?? "failure";

  const state = { ...acc.finish(), ...run } as RunState;
  if (!run.streaming && run.body && typeof run.body === "object" && (run.body as { type?: string }).type === "message") {
    const m = run.body as { content: Record<string, unknown>[]; usage?: Usage; stop_reason?: string | null };
    state.message = m;
    state.usage = m.usage ?? null;
    state.stopReason = m.stop_reason ?? null;
    const t = run.chunks.at(-1)?.t ?? run.headersT ?? 0;
    state.blocks = m.content.map((block, index) => ({
      index,
      type: String(block.type),
      startT: t,
      stopT: t,
      deltas: [],
      block,
    }));
  }
  return state;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** The billable part of a finished stream or body: what the route charges. */
export function billedUsage(state: RunState): { usage: BilledUsage; model: string } | null {
  const model = (state.message?.model as string | undefined) ?? null;
  if (!state.usage || !model) return null;
  const u = state.usage;
  return {
    usage: {
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    },
    model,
  };
}

export interface BilledUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

// ---- recordings ---------------------------------------------------------------------------------------------------------

/**
 * A real exchange, saved by `scripts/record-explorer.ts` from the real route, so the page has something true to show a
 * visitor with no credit, no key, or no network. Replayed through the same `fold` as a live run.
 */
export interface Recording {
  id: string;
  recordedAt: string;
  turns: { body: Record<string, unknown>; events: Envelope[] }[];
}
