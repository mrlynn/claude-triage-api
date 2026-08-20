/**
 * Tool definitions for the resolution agent.
 *
 * TEACHING NOTE — tool design is prompt design.
 * A tool's `description` and its parameter `.describe()` strings are the only
 * documentation Claude ever sees. Most "the model called the wrong tool"
 * bugs are description bugs, not model bugs. Three rules we follow here:
 *
 *   1. Say WHEN to use it, not just what it does. ("Call this before quoting
 *      any dollar figure" beats "Looks up an order.")
 *   2. Return small, structured, self-describing results. A tool that dumps
 *      50KB of JSON burns context and buries the signal.
 *   3. Make failure legible. Returning `{ found: false, ... }` teaches the
 *      model what to do next; throwing an opaque error does not.
 */
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { TOOL_DEFS } from "./definitions.js";
import { redactPII, sanitizeToolOutput, type Redaction } from "../lib/untrusted.js";

/** Every tool call is recorded so routes can show their work to the caller. */
export interface ToolCallRecord {
  tool: string;
  input: unknown;
  /**
   * The RAW result object, before redaction or escaping. Kept structured so
   * `enforceAuthority` and `verifyCitations` can read facts out of it rather
   * than out of the model's prose about it.
   */
  output: unknown;
  /** What was stripped before the text reached the model. Counts, not values. */
  redactions: Redaction[];
  ms: number;
}

export function createTools(trace: ToolCallRecord[]) {
  /**
   * Wraps a plain function so that it (a) lands in the trace and (b) returns a
   * STRING, which is what the tool runner requires.
   *
   * TEACHING NOTE: `run` must resolve to a string or an array of content
   * blocks — returning a bare object is a TypeScript error, and stringifying
   * it yourself is the point. Claude reads tool results as text, so the shape
   * you serialize is a prompt-engineering decision: stable key order, no
   * nulls-as-empty-strings, and no 50KB dumps.
   *
   * THIS IS ALSO THE TRUST BOUNDARY FOR TOOL OUTPUT, and that is why the
   * redaction lives here rather than in three call sites. Every tool result in
   * this service passes through this one closure, so one function buys three
   * properties at once:
   *
   *   1. PII never reaches the prompt. Handbook clause 4.5 requires card
   *      digits to be redacted; before this it was prose the model read.
   *   2. Instruction-shaped text in tool output is escaped. Tool results are
   *      not trusted input either — `lookup_customer` returns fields a
   *      customer supplied, and a note field containing markup would otherwise
   *      arrive wearing the authority of a system-provided fact. That is the
   *      second-order injection people forget after they have carefully
   *      escaped the user's message.
   *   3. The trace keeps the RAW object while the model sees the cleaned text,
   *      so deterministic checks read real numbers and the model does not read
   *      real card numbers.
   *
   * Ordering matters: redact first, escape second. Escaping first would turn
   * a separator into an entity and hide a card number from the Luhn check.
   */
  const record = <I, O>(tool: string, fn: (input: I) => O) => {
    return (input: I): string => {
      const started = Date.now();
      const output = fn(input);
      const { text, redactions } = redactPII(JSON.stringify(output, null, 2));
      trace.push({ tool, input, output, redactions, ms: Date.now() - started });
      return sanitizeToolOutput(text);
    };
  };

  // One wrapper over the shared definitions, rather than three hand-written
  // tools. The descriptions live in definitions.ts because the MCP server
  // reads the same array — a forked description is a silent behaviour fork.
  return TOOL_DEFS.map((def) =>
    betaZodTool({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema as z.ZodObject<z.ZodRawShape>,
      run: record(def.name, def.run),
    }),
  );

}
