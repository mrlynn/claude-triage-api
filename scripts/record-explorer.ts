/**
 * Records one real exchange per Messages API explorer preset, for the page to replay when a visitor cannot send live.
 *
 * It calls the running storefront's own `/api/explorer` over HTTP rather than the Anthropic API directly, so a
 * recording is byte for byte what the page would have received: the same envelope, the same redaction, the same chunk
 * boundaries. Follow-ups are recorded as further turns: the cache preset is sent twice, and a tool round trip is carried
 * to its end with the demo executors.
 *
 * SPENDS REAL CREDIT, on whatever key the storefront is running with: seven presets, about ten calls, a few cents.
 *
 * Run with:  npm run record:explorer                      (storefront on http://localhost:3000)
 *            EXPLORER_URL=http://localhost:3217 npm run record:explorer
 *            npm run record:explorer -- cache tools      (only these presets)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBody, type Body, type ExplorerOptions } from "../storefront/lib/explorerPolicy.js";
import { presets } from "../storefront/lib/explorerPresets.js";
import { runDemoTool } from "../storefront/lib/explorerTools.js";
import { SseParser, fold, type Envelope, type Recording } from "../storefront/lib/explorerWire.js";

const BASE = process.env.EXPLORER_URL ?? "http://localhost:3000";
const root = join(import.meta.dirname, "..", "storefront");
const out = join(root, "lib", "explorer-recordings");
const handbook = readFileSync(join(root, "data", "policies.md"), "utf8");
const only = new Set(process.argv.slice(2));

/** Tool round trips stop here, whatever the model wants: a recording is a demo, not an agent. */
const MAX_TOOL_TURNS = 4;

async function send(body: Body): Promise<Envelope[]> {
  const res = await fetch(`${BASE}/api/explorer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!(res.headers.get("content-type") ?? "").includes("event-stream") || !res.body) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  const events: Envelope[] = [];
  const parser = new SseParser();
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    for (const f of parser.push(decoder.decode(chunk as Uint8Array, { stream: true }), 0)) {
      // The meter describes whoever ran the script. It is not part of the exchange.
      if (f.event !== "meter") events.push({ event: f.event, data: f.data } as Envelope);
    }
  }
  return events;
}

for (const preset of presets(handbook)) {
  if (only.size && !only.has(preset.id)) continue;
  const turns: Recording["turns"] = [];
  let body = buildBody(preset.options).body;

  for (let i = 0; i < (preset.followUp === "tool_result" ? MAX_TOOL_TURNS : preset.followUp ? 2 : 1); i++) {
    const events = await send(body);
    turns.push({ body, events });
    const run = fold(events);
    const summary = run.apiError ? `HTTP ${run.status}` : `${run.stopReason} · ${run.usage?.output_tokens} out`;
    console.log(`${preset.id} turn ${i + 1}: ${summary} · $${run.costUsd ?? 0}`);

    if (preset.followUp !== "tool_result") continue;
    if (run.stopReason !== "tool_use") break;
    const content = run.message?.content as Record<string, unknown>[];
    const results = content
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ type: "tool_result", tool_use_id: String(b.id), ...runDemoTool(String(b.name), b.input) }))
      .map(({ is_error, ...r }) => (is_error ? { ...r, is_error } : r));
    const messages: ExplorerOptions["messages"] = [
      ...(body.messages as ExplorerOptions["messages"]),
      { role: "assistant", content },
      { role: "user", content: results },
    ];
    body = { ...body, messages };
  }

  mkdirSync(out, { recursive: true });
  const recording: Recording = { id: preset.id, recordedAt: new Date().toISOString(), turns };
  writeFileSync(join(out, `${preset.id}.json`), `${JSON.stringify(recording, null, 1)}\n`);
}
