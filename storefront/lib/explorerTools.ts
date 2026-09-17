import { ORDERS, getOrder } from "./orders";
import { PRODUCTS } from "./products";

/**
 * The two tools the Messages API explorer offers, and the code that "runs" them.
 *
 * The definitions are fixed on purpose. The route accepts a tool only if its name, description and schema match one of
 * these exactly: a tool description is text the model reads, so letting a visitor edit it would make the body cap the
 * only thing bounding a prompt nobody reviewed. `cache_control`, `strict` and `eager_input_streaming` stay editable,
 * because those are the options the page exists to show.
 *
 * The executors run in the browser. That is the lesson of a tool round trip: the API never runs your tool, it stops
 * with `stop_reason: "tool_use"` and waits for you to send the result back.
 */

export interface DemoTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

export const DEMO_TOOLS: readonly DemoTool[] = [
  {
    name: "lookup_order",
    description:
      "Look up a Northwind order by id (format NW-12345). Returns status, dates, tracking number and line items.",
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "The order id, e.g. NW-48211." } },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  {
    name: "check_stock",
    description:
      "Check how many units of a Northwind product are in stock. Accepts the product slug or its name as written on the order.",
    input_schema: {
      type: "object",
      properties: { product: { type: "string", description: "Product slug or name." } },
      required: ["product"],
      additionalProperties: false,
    },
  },
];

export const DEMO_TOOL_NAMES = DEMO_TOOLS.map((t) => t.name);

/** Stable per product, so a recording and a live run agree on what "in stock" means. */
function fakeStock(slug: string): number {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) % 997;
  return h % 5 === 0 ? 0 : (h % 23) + 1;
}

export interface ToolRun {
  content: string;
  is_error: boolean;
}

/** What your code would return. Errors are results too: the model reads `is_error` and can recover. */
export function runDemoTool(name: string, input: unknown): ToolRun {
  const args = (input ?? {}) as Record<string, unknown>;
  if (name === "lookup_order") {
    const id = typeof args.order_id === "string" ? args.order_id : "";
    const order = getOrder(id);
    if (!order) {
      return {
        content: `No order ${JSON.stringify(id)}. Known ids: ${ORDERS.map((o) => o.order_id).join(", ")}.`,
        is_error: true,
      };
    }
    return { content: JSON.stringify(order, null, 2), is_error: false };
  }
  if (name === "check_stock") {
    const q = typeof args.product === "string" ? args.product.trim().toLowerCase() : "";
    const product = PRODUCTS.find((p) => p.slug === q || p.name.toLowerCase() === q) ??
      PRODUCTS.find((p) => q.length > 2 && p.name.toLowerCase().includes(q));
    if (!product) return { content: `No product matching ${JSON.stringify(q)}.`, is_error: true };
    return {
      content: JSON.stringify({ slug: product.slug, name: product.name, in_stock: fakeStock(product.slug) }),
      is_error: false,
    };
  }
  return { content: `Unknown tool ${name}.`, is_error: true };
}
