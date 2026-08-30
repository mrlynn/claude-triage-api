# Claude tool use: build a safe, auditable agent loop

Claude tool use lets a model request facts from your systems before it answers. A reliable implementation does not merely expose functions: it gives the model clear rules for when to call them, executes only the approved tools, caps the loop, and records the full trace and total cost.

## What a tool description must say

```ts
const lookupOrder = betaZodTool({
  name: "lookup_order",
  inputSchema: z.object({ order_id: z.string() }),
  description:
    "Look up an order before stating any fact about its status, delivery, or refund eligibility. Never rely on a customer's claim when this tool can verify it.",
  run: async ({ order_id }) => orders.get(order_id),
});
```

“Looks up an order” describes a function signature. The longer description tells Claude the decision rule. Most apparent tool-selection failures are specification failures of this kind.

## Four controls that belong in every loop

1. **Bounded iterations.** Set a maximum number of turns and handle hitting it as an incomplete result, not a normal success.
2. **Total usage accounting.** Sum usage from every model turn. The final response reports only the final request, while conversation history grows through the loop.
3. **Untrusted tool output.** Treat results from databases, search, and external systems as data—not instructions. Validate and sanitize before they reach a model or an action.
4. **Independent enforcement.** Recalculate hard limits, such as refund authority, in application code from trusted trace data. A model should recommend; deterministic code should enforce.

## What not to do

- Do not let the model invent arbitrary tool calls or execute actions directly.
- Do not force tool choice as a substitute for a clear decision rule.
- Do not report only the final turn’s token use.
- Do not treat a schema-valid answer as safe after an iteration cap is reached.

## Go deeper

[Lab 3: tool use and the agentic loop](../labs/lab-3-tool-use.md) builds a bounded loop over order, customer, and policy lookups, then shows why the trace is both an audit record and a guardrail input. You can inspect a complete run first in the [agentic-loop stepper](https://triage.mlynn.dev/playground/trace).
