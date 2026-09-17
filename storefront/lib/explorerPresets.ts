import { DEFAULT_OPTIONS, type ExplorerOptions } from "./explorerPolicy";

/**
 * Starting points for the explorer, each built to make one part of the API visible.
 *
 * Shared by the page and `scripts/record-explorer.ts`, so a recording is always of a preset the page still offers.
 * The handbook is passed in rather than read here: the page reads it on the server, the script from disk.
 */

export interface Preset {
  id: string;
  label: string;
  /** What to look at once it has run. */
  watch: string;
  options: ExplorerOptions;
  /** Record a second turn: the same body again (cache), or a tool round trip. */
  followUp?: "repeat" | "tool_result";
}

const user = (content: string): ExplorerOptions["messages"] => [{ role: "user", content }];

const CLASSIFY_SCHEMA = JSON.stringify(
  {
    type: "object",
    properties: {
      category: { type: "string", enum: ["shipping", "returns", "warranty", "product_question", "other"] },
      urgency: { type: "string", enum: ["low", "medium", "high"] },
      summary: { type: "string" },
    },
    required: ["category", "urgency", "summary"],
    additionalProperties: false,
  },
  null,
  2,
);

export function presets(handbook: string): Preset[] {
  return [
    {
      id: "hello",
      label: "Hello, stream",
      watch:
        "One text block. Watch message_start carry the input tokens before a word is written, then text_delta frames, then message_delta with the final output count.",
      options: {
        ...DEFAULT_OPTIONS,
        effort: "low",
        messages: user("In two sentences: what does a three-layer shell jacket do that a two-layer one doesn't?"),
      },
    },
    {
      id: "no-stream",
      label: "Same, no stream",
      watch:
        "The same request with stream off. Nothing arrives until everything is done: one JSON body, and the time to first byte is the time to the whole answer.",
      options: {
        ...DEFAULT_OPTIONS,
        stream: false,
        effort: "low",
        messages: user("In two sentences: what does a three-layer shell jacket do that a two-layer one doesn't?"),
      },
    },
    {
      id: "think",
      label: "Watch it think",
      watch:
        "A thinking block streams before the text block: thinking_delta, then a signature_delta you must send back unchanged on a later turn. Set display to omitted and the thinking text streams empty but is still billed.",
      options: {
        ...DEFAULT_OPTIONS,
        maxTokens: 2048,
        thinking: "adaptive",
        display: "summarized",
        effort: "medium",
        messages: user(
          "A tent weighs 2.4 kg and the poles are 30% of that. A lighter pole set saves 40% of the pole weight. What does the tent weigh now, and is it worth $90 for a thru-hiker who values 100 g at $15?",
        ),
      },
    },
    {
      id: "tools",
      label: "Tool round trip",
      watch:
        "The response stops with stop_reason tool_use. The input arrives as input_json_delta fragments that only parse at the end. Nothing ran: your code runs the tool and sends a tool_result back as turn 2.",
      followUp: "tool_result",
      options: {
        ...DEFAULT_OPTIONS,
        effort: "low",
        tools: ["lookup_order", "check_stock"],
        toolChoice: "auto",
        eagerInput: true,
        messages: user("Where is my order NW-52044? And if I wanted a second one of what I ordered, is it in stock?"),
      },
    },
    {
      id: "cache",
      label: "Cache miss → hit",
      watch:
        "Send it twice. The first message_start reports cache_creation_input_tokens: the handbook was written to the cache at 1.25×. The second reports cache_read_input_tokens at 0.1×, and usually reaches message_start sooner.",
      followUp: "repeat",
      options: {
        ...DEFAULT_OPTIONS,
        effort: "low",
        maxTokens: 400,
        system: `You answer questions for Northwind Outfitters customers using only this handbook.\n\n${handbook}`,
        cacheSystem: true,
        messages: user("How long do I have to return a jacket I've worn once?"),
      },
    },
    {
      id: "json",
      label: "JSON schema",
      watch:
        "output_config.format constrains decoding, so the one text block is valid JSON for the schema, and it still streams in fragments.",
      options: {
        ...DEFAULT_OPTIONS,
        effort: "low",
        schemaOn: true,
        schema: CLASSIFY_SCHEMA,
        messages: user(
          "My tent pole snapped on the second night out, I'm on the trail until Friday and I need to know if this is covered.",
        ),
      },
    },
    {
      id: "400",
      label: "Make it 400",
      watch:
        "thinking.budget_tokens was removed on Opus 5. The API answers before generating anything: no stream, a JSON error body, a request-id, and no charge.",
      options: {
        ...DEFAULT_OPTIONS,
        thinking: "enabled",
        budgetTokens: 1024,
        messages: user("Say hello."),
      },
    },
  ];
}
