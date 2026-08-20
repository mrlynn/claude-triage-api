/**
 * Provider-neutral tool definitions.
 *
 * WHY THIS FILE EXISTS: `createTools()` used to weld four separate concerns
 * into one place — the name, the description, the input schema, the business
 * function, the trace side-effect, and the SDK wrapper. That is fine while
 * there is exactly one consumer. The moment there are two (the Messages API
 * tool runner, and an MCP server) you either fork the definitions or you split
 * them, and a forked tool description is a silent behaviour fork: the model
 * behind one surface is reading different instructions from the model behind
 * the other, and nothing type-checks that.
 *
 * So the descriptions live here, once. `tools/index.ts` wraps them for the
 * Anthropic SDK and adds the trace and redaction; `mcp/server.ts` wraps the
 * same array for MCP. Neither owns the text.
 *
 * TEACHING NOTE — tool design is prompt design.
 * A tool's `description` and its parameter `.describe()` strings are the only
 * documentation Claude ever sees. Most "the model called the wrong tool" bugs
 * are description bugs, not model bugs. Three rules followed here:
 *
 *   1. Say WHEN to use it, not just what it does. ("Call this before quoting
 *      any dollar figure" beats "Looks up an order.")
 *   2. Return small, structured, self-describing results. A tool that dumps
 *      50KB of JSON burns context and buries the signal.
 *   3. Make failure legible. Returning `{ found: false, ... }` teaches the
 *      model what to do next; throwing an opaque error does not.
 */
import { z } from "zod";
import { findOrder, findCustomer, searchPolicy, daysSince } from "./data.js";

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: S;
  /**
   * The business function. Pure, synchronous, and unaware of Claude, MCP, the
   * trace, or redaction — every one of which is applied by a wrapper. That is
   * what makes it portable, and what makes it testable without a network.
   */
  run: (input: z.infer<S>) => unknown;
}

const lookupOrder: ToolDef = {
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
  run: (input) => {
    const { order_id } = input as { order_id: string };
    const order = findOrder(order_id);
    if (!order) return { found: false, order_id };
    return {
      found: true,
      ...order,
      days_since_delivery:
        order.delivered_at === null ? null : daysSince(order.delivered_at),
      days_since_order: daysSince(order.placed_at),
    };
  },
};

const lookupCustomer: ToolDef = {
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
  run: (input) => {
    const { email } = input as { email: string };
    const customer = findCustomer(email);
    return customer ? { found: true, ...customer } : { found: false, email };
  },
};

const searchPolicyTool: ToolDef = {
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
  run: (input) => {
    const { query } = input as { query: string };
    const sections = searchPolicy(query);
    return sections.length > 0
      ? { matches: sections.length, sections }
      : { matches: 0, sections: [], hint: "Try broader keywords." };
  },
};

/** The one list. Every surface wraps this; none of them redefines it. */
export const TOOL_DEFS: ToolDef[] = [lookupOrder, lookupCustomer, searchPolicyTool];
