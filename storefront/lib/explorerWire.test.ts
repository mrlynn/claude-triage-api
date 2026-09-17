import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { SseParser, billedUsage, fold, type Envelope, type Recording } from "./explorerWire";

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** A streamed tool call, cut into network reads at awkward places: mid-frame, and several frames in one read. */
const WIRE = [
  frame("message_start", {
    type: "message_start",
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5",
      content: [],
      stop_reason: null,
      usage: { input_tokens: 50, output_tokens: 1, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 },
    },
  }),
  frame("ping", { type: "ping" }),
  frame("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
  frame("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Checking" } }),
  frame("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " now." } }),
  frame("content_block_stop", { type: "content_block_stop", index: 0 }),
  frame("content_block_start", {
    type: "content_block_start",
    index: 1,
    content_block: { type: "tool_use", id: "toolu_1", name: "lookup_order", input: {} },
  }),
  frame("content_block_delta", {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '{"order_id": "NW-' },
  }),
  frame("content_block_delta", {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '52044"}' },
  }),
  frame("content_block_stop", { type: "content_block_stop", index: 1 }),
  frame("message_delta", {
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: null },
    usage: { output_tokens: 42 },
  }),
  frame("message_stop", { type: "message_stop" }),
].join("");

function envelopes(cuts: number[]): Envelope[] {
  const out: Envelope[] = [
    { event: "start", data: { t: 0, funding: "house", sdk: "test" } },
    { event: "headers", data: { t: 300, status: 200, headers: { "content-type": "text/event-stream" } } },
  ];
  let at = 0;
  [...cuts, WIRE.length].forEach((cut, i) => {
    out.push({ event: "wire", data: { t: 310 + i * 10, chunk: WIRE.slice(at, cut) } });
    at = cut;
  });
  out.push({ event: "done", data: { t: 400, model: "claude-opus-5", cost_usd: 0.001 } });
  return out;
}

test("a stream assembles into the message, however the reads are cut", () => {
  for (const cuts of [[], [7], [120, 121, 500, 900], Array.from({ length: 40 }, (_, i) => (i + 1) * 37)]) {
    const run = fold(envelopes(cuts));
    assert.equal(run.stopReason, "tool_use");
    assert.equal(run.pings, 1);
    assert.deepEqual(run.message?.content, [
      { type: "text", text: "Checking now." },
      { type: "tool_use", id: "toolu_1", name: "lookup_order", input: { order_id: "NW-52044" } },
    ]);
    // message_delta's usage replaces output_tokens and leaves the input side from message_start alone.
    assert.deepEqual(billedUsage(run), {
      model: "claude-opus-5",
      usage: { input_tokens: 50, output_tokens: 42, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 },
    });
  }
});

test("a partial fold is the stream so far: tool input does not parse mid-block", () => {
  const events = envelopes(Array.from({ length: 60 }, (_, i) => (i + 1) * 25));
  const midTool = events.findIndex(
    (e) => e.event === "wire" && fold(events.slice(0, events.indexOf(e) + 1)).blocks[1]?.partialJson === '{"order_id": "NW-',
  );
  assert.ok(midTool > 0);
  const run = fold(events.slice(0, midTool + 1));
  assert.equal(run.blocks[1].jsonComplete, false);
  assert.equal(run.stopReason, null);
});

test("an SSE frame split across reads waits for its blank line", () => {
  const p = new SseParser();
  assert.deepEqual(p.push("event: ping\nda", 1), []);
  const [f] = p.push('ta: {"type":"ping"}\n\n', 2);
  assert.equal(f.event, "ping");
  assert.equal(f.t, 2);
});

test("a non-streaming body folds into the same message shape", () => {
  const message = { type: "message", model: "claude-opus-5", content: [{ type: "text", text: "Hi" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } };
  const run = fold([
    { event: "headers", data: { t: 900, status: 200, headers: { "content-type": "application/json" } } },
    { event: "wire", data: { t: 905, chunk: JSON.stringify(message) } },
  ]);
  assert.equal(run.streaming, false);
  assert.equal(run.stopReason, "end_turn");
  assert.equal(run.blocks.length, 1);
  assert.equal(billedUsage(run)?.usage.output_tokens, 2);
});

test("every recording replays to a finished message whose usage matches what was billed", () => {
  const dir = join(import.meta.dirname, "explorer-recordings");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const rec = JSON.parse(readFileSync(join(dir, file), "utf8")) as Recording;
    assert.ok(rec.turns.length > 0, file);
    for (const [i, turn] of rec.turns.entries()) {
      const run = fold(turn.events);
      if (run.apiError) {
        assert.ok(run.status && run.status >= 400, `${file} turn ${i}`);
        continue;
      }
      assert.equal(run.ended, "done", `${file} turn ${i}`);
      assert.ok(run.stopReason, `${file} turn ${i}`);
      assert.ok((billedUsage(run)?.usage.output_tokens ?? 0) > 0, `${file} turn ${i}`);
    }
  }
});
