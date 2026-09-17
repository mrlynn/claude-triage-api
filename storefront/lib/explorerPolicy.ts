import { z } from "zod";
import { EXPLORER_MAX_BODY_CHARS, EXPLORER_MAX_MESSAGES, EXPLORER_MAX_TOKENS, EXPLORER_MODELS } from "./callLimits";
import { DEMO_TOOLS } from "./explorerTools";

/**
 * What the Messages API explorer will send, and what it will refuse to.
 *
 * TWO DIFFERENT KINDS OF "NO". This file separates them on purpose:
 *
 *   1. `parseExplorerBody` refuses what would cost money the page did not budget for: a model outside the allowlist, a
 *      `max_tokens` above the cap, a body longer than the ceiling in `cost.ts`, block types whose token count text
 *      length does not bound (images, documents), tools that are not the demo tools.
 *   2. `hints` explains what the API itself will reject — `budget_tokens` on Opus 5, prefill, forced tool use with
 *      thinking — and does NOT stop the request. A 400 costs nothing and its body is the best documentation of the
 *      rule, so the page lets you send it and read it.
 *
 * Pure, so `explorerPolicy.test.ts` can hold the cost boundary still.
 */

export type ExplorerModel = (typeof EXPLORER_MODELS)[number];

// ---- the form ----------------------------------------------------------------------------------------------------

export type Omit_ = "omit";

export interface ExplorerOptions {
  model: ExplorerModel;
  maxTokens: number;
  stream: boolean;
  system: string;
  cacheSystem: boolean;
  autoCache: boolean;
  /** Message params, exactly as sent. Text turns are edited in the form; tool turns arrive from a round trip. */
  messages: { role: "user" | "assistant"; content: string | Record<string, unknown>[] }[];
  stopSequences: string;
  userId: string;
  thinking: Omit_ | "adaptive" | "disabled" | "enabled";
  budgetTokens: number;
  display: Omit_ | "summarized" | "omitted";
  effort: Omit_ | "low" | "medium" | "high" | "xhigh" | "max";
  tools: string[];
  toolChoice: Omit_ | "auto" | "any" | "none" | "tool";
  toolChoiceName: string;
  eagerInput: boolean;
  cacheTools: boolean;
  schemaOn: boolean;
  schema: string;
}

export const DEFAULT_OPTIONS: ExplorerOptions = {
  model: "claude-opus-5",
  maxTokens: 1024,
  stream: true,
  system: "",
  cacheSystem: false,
  autoCache: false,
  messages: [{ role: "user", content: "" }],
  stopSequences: "",
  userId: "",
  thinking: "omit",
  budgetTokens: 1024,
  display: "omit",
  effort: "omit",
  tools: [],
  toolChoice: "omit",
  toolChoiceName: "lookup_order",
  eagerInput: false,
  cacheTools: false,
  schemaOn: false,
  schema: "",
};

export type Body = Record<string, unknown>;

/**
 * The form, as a request body. Key order is the order a reader expects, and it is also the order the bytes go out in,
 * since the route forwards the object it parsed.
 */
export function buildBody(o: ExplorerOptions): { body: Body; schemaError: string | null } {
  const body: Body = { model: o.model, max_tokens: o.maxTokens };
  if (o.stream) body.stream = true;
  if (o.system.trim()) {
    body.system = o.cacheSystem
      ? [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }]
      : o.system;
  }
  body.messages = o.messages;

  if (o.tools.length) {
    const tools: Record<string, unknown>[] = DEMO_TOOLS.filter((t) => o.tools.includes(t.name)).map((t) => ({
      ...t,
      ...(o.eagerInput ? { eager_input_streaming: true } : {}),
    }));
    // A breakpoint on the LAST tool caches the whole tool list, since tools render first.
    const last = tools.at(-1);
    if (o.cacheTools && last) last.cache_control = { type: "ephemeral" };
    body.tools = tools;
  }
  if (o.toolChoice !== "omit") {
    body.tool_choice = o.toolChoice === "tool" ? { type: "tool", name: o.toolChoiceName } : { type: o.toolChoice };
  }

  if (o.thinking === "enabled") body.thinking = { type: "enabled", budget_tokens: o.budgetTokens };
  else if (o.thinking !== "omit" || o.display !== "omit") {
    const thinking: Record<string, unknown> = { type: o.thinking === "omit" ? "adaptive" : o.thinking };
    if (o.display !== "omit") thinking.display = o.display;
    body.thinking = thinking;
  }

  let schemaError: string | null = null;
  const output: Record<string, unknown> = {};
  if (o.effort !== "omit") output.effort = o.effort;
  if (o.schemaOn) {
    try {
      output.format = { type: "json_schema", schema: JSON.parse(o.schema) };
    } catch (err) {
      schemaError = `Schema is not valid JSON: ${(err as Error).message}`;
    }
  }
  if (Object.keys(output).length) body.output_config = output;

  const stops = o.stopSequences.split(",").map((s) => s.trim()).filter(Boolean);
  if (stops.length) body.stop_sequences = stops;
  if (o.userId.trim()) body.metadata = { user_id: o.userId.trim() };
  if (o.autoCache) body.cache_control = { type: "ephemeral" };
  return { body, schemaError };
}

// ---- the cost boundary ----------------------------------------------------------------------------------------------

const cacheControl = z.object({ type: z.literal("ephemeral"), ttl: z.enum(["5m", "1h"]).optional() }).strict();

const text = z.looseObject({ type: z.literal("text"), text: z.string(), cache_control: cacheControl.optional() });

/**
 * Content a text length bounds. `thinking` and `redacted_thinking` must be accepted, because a tool round trip on a
 * thinking model has to send them back unchanged; their size counts against the body cap like everything else.
 */
const block = z.discriminatedUnion("type", [
  text,
  z.looseObject({ type: z.literal("thinking"), thinking: z.string(), signature: z.string() }),
  z.looseObject({ type: z.literal("redacted_thinking"), data: z.string() }),
  z.looseObject({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.unknown() }),
  z
    .object({
      type: z.literal("tool_result"),
      tool_use_id: z.string(),
      content: z.union([z.string(), z.array(text)]).optional(),
      is_error: z.boolean().optional(),
      cache_control: cacheControl.optional(),
    })
    .strict(),
]);

const tool = z
  .object({
    name: z.string(),
    description: z.string(),
    input_schema: z.record(z.string(), z.unknown()),
    cache_control: cacheControl.optional(),
    eager_input_streaming: z.boolean().optional(),
    strict: z.boolean().optional(),
  })
  .strict()
  .refine(
    (t) => {
      const demo = DEMO_TOOLS.find((d) => d.name === t.name);
      return (
        !!demo &&
        demo.description === t.description &&
        JSON.stringify(demo.input_schema) === JSON.stringify(t.input_schema)
      );
    },
    { message: "Only the demo tools, with their definitions unchanged." },
  );

/**
 * Deliberately loose where the API is strict. `thinking`, `tool_choice` and `output_config` are passed through as
 * objects so a wrong shape reaches the API and comes back as its own 400, which is the point of "Make it 400".
 */
const explorerBody = z
  .object({
    model: z.enum(EXPLORER_MODELS),
    max_tokens: z.number().int().min(1).max(EXPLORER_MAX_TOKENS),
    stream: z.boolean().optional(),
    system: z.union([z.string(), z.array(text).max(4)]).optional(),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.union([z.string(), z.array(block).min(1).max(24)]),
          })
          .strict(),
      )
      .min(1)
      .max(EXPLORER_MAX_MESSAGES),
    tools: z.array(tool).max(DEMO_TOOLS.length).optional(),
    tool_choice: z.record(z.string(), z.unknown()).optional(),
    thinking: z.record(z.string(), z.unknown()).optional(),
    output_config: z.record(z.string(), z.unknown()).optional(),
    stop_sequences: z.array(z.string().min(1).max(64)).max(4).optional(),
    metadata: z.object({ user_id: z.string().max(64) }).strict().optional(),
    cache_control: cacheControl.optional(),
  })
  .strict();

export type ExplorerBody = z.infer<typeof explorerBody>;

export type Parsed = { ok: true; body: ExplorerBody; chars: number } | { ok: false; detail: string };

export function parseExplorerBody(raw: unknown): Parsed {
  const chars = JSON.stringify(raw ?? null).length;
  if (chars > EXPLORER_MAX_BODY_CHARS) {
    return {
      ok: false,
      detail: `The body is ${chars.toLocaleString("en-US")} characters; the explorer sends at most ${EXPLORER_MAX_BODY_CHARS.toLocaleString("en-US")}.`,
    };
  }
  const result = explorerBody.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, detail: issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid body." };
  }
  return { ok: true, body: result.data, chars };
}

// ---- what the API will say --------------------------------------------------------------------------------------------

export interface Hint {
  level: "error" | "warn" | "info";
  /** The body path the hint is about, so the page can highlight it. */
  path: string;
  text: string;
}

/** Minimum cacheable prefix, from the prompt-caching docs. Below it, `cache_control` is accepted and silently ignored. */
export const CACHE_MINIMUM: Record<ExplorerModel, number> = {
  "claude-opus-5": 512,
  "claude-sonnet-5": 1024,
  "claude-haiku-4-5": 4096,
};


export function hints(body: Body): Hint[] {
  const out: Hint[] = [];
  const model = body.model as ExplorerModel;
  const haiku = model === "claude-haiku-4-5";
  const thinking = body.thinking as Record<string, unknown> | undefined;
  const output = body.output_config as Record<string, unknown> | undefined;
  const effort = output?.effort as string | undefined;
  const messages = (body.messages as { role: string; content: unknown }[]) ?? [];
  const choice = (body.tool_choice as { type?: string } | undefined)?.type;

  if (thinking?.type === "enabled" && !haiku) {
    out.push({
      level: "error",
      path: "thinking",
      text: `budget_tokens is removed on ${model}: expect a 400. Use {type: "adaptive"} and output_config.effort.`,
    });
  }
  if (haiku && thinking?.type === "adaptive") {
    out.push({ level: "error", path: "thinking", text: "Haiku 4.5 has no adaptive thinking; it takes {type: \"enabled\", budget_tokens}." });
  }
  if (haiku && effort) {
    out.push({ level: "error", path: "output_config.effort", text: "effort is not supported on Haiku 4.5." });
  }
  if (model === "claude-opus-5" && thinking?.type === "disabled" && (effort === "xhigh" || effort === "max")) {
    out.push({ level: "error", path: "thinking", text: "Opus 5 accepts disabled thinking only at effort high or below." });
  }
  if (messages.at(-1)?.role === "assistant") {
    out.push({ level: "error", path: "messages", text: "The last message is from the assistant (prefill), which these models reject." });
  }
  if ((choice === "any" || choice === "tool") && thinking?.type !== "disabled" && !haiku) {
    out.push({
      level: "warn",
      path: "tool_choice",
      text: "Forced tool use (any / tool) cannot be combined with thinking, which is on unless disabled on this model.",
    });
  }
  if (body.tool_choice && !body.tools) {
    out.push({ level: "error", path: "tool_choice", text: "tool_choice without tools." });
  }
  if (!thinking && model === "claude-opus-5") {
    out.push({ level: "info", path: "thinking", text: "Omitted thinking on Opus 5 means adaptive: it may think before answering." });
  }
  if (thinking && thinking.type !== "disabled" && !thinking.display && !haiku) {
    out.push({
      level: "info",
      path: "thinking",
      text: 'display defaults to "omitted": thinking blocks stream with empty text. Set "summarized" to read them.',
    });
  }
  if (body.system && Array.isArray(body.system) && !haiku) {
    // Four characters a token, for a hint only. Preflight asks count_tokens for the real number.
    const chars = (body.system as { text: string }[]).reduce((n, b) => n + b.text.length, 0);
    const tokens = Math.ceil(chars / 4);
    if (tokens < CACHE_MINIMUM[model]) {
      out.push({
        level: "warn",
        path: "system",
        text: `The system prompt is about ${tokens} tokens, below ${model}'s ${CACHE_MINIMUM[model]}-token cache minimum. It will not cache, and nothing will say so.`,
      });
    }
  }
  if (haiku && (body.cache_control || Array.isArray(body.system))) {
    out.push({ level: "warn", path: "system", text: "Haiku 4.5 needs a 4,096-token prefix before anything caches." });
  }
  if (body.stream !== true && (body.max_tokens as number) > 1024) {
    out.push({
      level: "info",
      path: "stream",
      text: "Not streaming: nothing arrives until the whole response is generated. Fine here; a timeout risk at large max_tokens.",
    });
  }
  if ((body.tools as Record<string, unknown>[] | undefined)?.some((t) => t.eager_input_streaming) && body.stream !== true) {
    out.push({ level: "info", path: "tools", text: "eager_input_streaming only changes anything on a streaming request." });
  }
  return out;
}

// ---- the same request, as code ----------------------------------------------------------------------------------------

function pythonLiteral(value: unknown, indent = 0): string {
  const pad = "    ".repeat(indent + 1);
  const end = "    ".repeat(indent);
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((v) => pad + pythonLiteral(v, indent + 1)).join(",\n")},\n${end}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${pythonLiteral(v, indent + 1)}`).join(",\n")},\n${end}}`;
}

/** Long strings are elided in snippets, which exist to show shape, not to be a second copy of the handbook. */
function elide(value: unknown, max = 240): unknown {
  if (typeof value === "string") return value.length > max ? `${value.slice(0, max)}… (${value.length} chars)` : value;
  if (Array.isArray(value)) return value.map((v) => elide(v, max));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, elide(v, max)]));
  }
  return value;
}

export function snippets(body: Body): { typescript: string; python: string; curl: string } {
  const { stream, ...params } = elide(body) as Body;
  const ts = JSON.stringify(params, null, 2).replace(/"([a-z_][a-z0-9_]*)":/g, "$1:");
  const typescript = stream
    ? `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // ANTHROPIC_API_KEY

const stream = client.messages.stream(${ts});

stream.on("text", (text) => process.stdout.write(text));
const message = await stream.finalMessage();
console.log(message.stop_reason, message.usage);`
    : `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // ANTHROPIC_API_KEY

const message = await client.messages.create(${ts});

console.log(message.stop_reason, message.usage);`;

  const kwargs = Object.entries(params)
    .map(([k, v]) => `    ${k}=${pythonLiteral(v, 1)},`)
    .join("\n");
  const python = stream
    ? `import anthropic

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY

with client.messages.stream(
${kwargs}
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    message = stream.get_final_message()

print(message.stop_reason, message.usage)`
    : `import anthropic

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY

message = client.messages.create(
${kwargs}
)

print(message.stop_reason, message.usage)`;

  const json = JSON.stringify(elide(body), null, 2).replace(/'/g, "'\\''");
  const curl = `curl https://api.anthropic.com/v1/messages${stream ? " \\\n  --no-buffer" : ""} \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '${json}'`;

  return { typescript, python, curl };
}
