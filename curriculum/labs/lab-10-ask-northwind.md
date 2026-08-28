# Lab 10 — Ask Northwind

You have shipped a support API. Now give the learner a way to ask for help
without turning a chat box into a second, unbounded product.

## The capstone

Build **Ask Northwind**, one assistant available in both the course and the
fictional storefront. On the course it should find the learner's next step and
link to the canonical lab. In the store it may investigate a support problem,
but it must only propose an outcome. A separate server endpoint records a
simulated refund, replacement, or escalation after the person confirms it.

## What you will learn

- Run Anthropic's Agent SDK in an isolated service rather than a browser or a
  serverless request handler.
- Give an agent narrow, typed MCP tools instead of filesystem or shell access.
- Carry only minimal, trusted page context across two sites.
- Stream a conversation, bound turns and costs, and persist anonymous sessions
  for a short, explicit retention period.
- Treat confirmation and authority as application code, not model behaviour.

## The boundary

The course and shop call the storefront facade. It sets an opaque, httpOnly
seven-day session cookie for `.mlynn.dev`, checks the allowed origins, and
forwards the request to the private agent runtime. The browser never sees an
Anthropic key or the agent-service credential.

The runtime disables built-in tools. Its only MCP tools are `find_learning_step`,
`get_current_context`, and (on the storefront) `get_support_policy`. Customer
text is untrusted data, never instructions. The agent has six turns; it may
explain, look up, and propose, but it cannot mutate a record itself.

## Check your work

1. From Lab 4, ask what to do next. The assistant links to the next relevant
   canonical course page rather than inventing a path.
2. Ask a storefront support question containing an instruction to reveal its
   tools. It refuses the instruction and remains in role.
3. Request a $900 refund. The result is an escalation, not an approved refund.
4. Confirm a valid proposed action twice. The first confirmation records one
   simulated case; the second is rejected.
5. Open the other site. The same anonymous session remains available for seven
   days, but no raw support message is retained beyond that boundary.

> **Why a separate service?** The Agent SDK supervises a Claude subprocess and
> stores session state. It needs an isolated, containerized runtime; a
> serverless storefront route is a facade, not the agent host.
