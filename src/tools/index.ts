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
import { findOrder, findCustomer, searchPolicy, daysSince } from "./data.js";

/** Every tool call is recorded so routes can show their work to the caller. */
export interface ToolCallRecord {
  tool: string;
  input: unknown;
  output: unknown;
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
   */
  const record = <I, O>(tool: string, fn: (input: I) => O) => {
    return (input: I): string => {
      const started = Date.now();
      const output = fn(input);
      trace.push({ tool, input, output, ms: Date.now() - started });
      return JSON.stringify(output, null, 2);
    };
  };

  const lookupOrder = betaZodTool({
    name: "lookup_order",
    description:
      "Retrieve an order by its identifier. Call this before stating any fact about an order's " +
      "contents, price, status, or delivery date — never rely on what the customer claims. " +
      "Returns found: false when the identifier does not exist, which usually means the customer " +
      "mistyped it or is referring to a different account.",
    inputSchema: z.object({
      order_id: z
        .string()
        .describe("The order identifier, e.g. 'NW-48211'. Case-insensitive."),
    }),
    run: record("lookup_order", ({ order_id }) => {
      const order = findOrder(order_id);
      if (!order) return { found: false, order_id };
      return {
        found: true,
        ...order,
        days_since_delivery:
          order.delivered_at === null ? null : daysSince(order.delivered_at),
        days_since_order: daysSince(order.placed_at),
      };
    }),
  });

  const lookupCustomer = betaZodTool({
    name: "lookup_customer",
    description:
      "Retrieve a customer's account standing by email: membership tier, lifetime value, refunds " +
      "issued in the last 30 days, and how many times they have contacted us in 90 days. Call this " +
      "before deciding between a refund, a replacement, and an escalation — policy clause 5.3 " +
      "escalates any account above $500 of refunds in 30 days, and you cannot check that from the " +
      "ticket text alone.",
    inputSchema: z.object({
      email: z.string().describe("The customer's email address on file."),
    }),
    run: record("lookup_customer", ({ email }) => {
      const customer = findCustomer(email);
      return customer ? { found: true, ...customer } : { found: false, email };
    }),
  });

  const searchPolicyTool = betaZodTool({
    name: "search_policy",
    description:
      "Search the Northwind support policy handbook and return the most relevant sections verbatim. " +
      "Use this whenever a decision depends on a rule — refund windows, escalation triggers, " +
      "shipping timelines, agent authority limits. Cite only clause numbers that appear in text " +
      "this tool returned to you.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Keywords describing the rule you need, e.g. 'lost package replacement threshold' or 'refund authority limit'.",
        ),
    }),
    run: record("search_policy", ({ query }) => {
      const sections = searchPolicy(query);
      return sections.length > 0
        ? { matches: sections.length, sections }
        : { matches: 0, sections: [], hint: "Try broader keywords." };
    }),
  });

  return [lookupOrder, lookupCustomer, searchPolicyTool];
}
