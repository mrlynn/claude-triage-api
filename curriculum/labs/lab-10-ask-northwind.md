# Lab 10 — Ask Northwind

You have shipped a support API. Now give people a way to ask for help without
turning a chat box into a second, unbounded product.

## The capstone

Build **Ask Northwind**, one assistant available in both the course and the
fictional storefront. On the course it finds the learner's next step and links
to the canonical lab. In the shop it may investigate a support problem, but it
may only *propose* an outcome. When the person confirms, a separate request
files a real ticket onto the same reviewer queue the support form feeds.

Note where the write lives. The agent has no tool that opens a ticket — giving
it one would put the write back on the model's say-so, which is the thing this
whole arrangement exists to prevent. The confirmation is the write.

## What you will learn

- Run an agentic loop with `messages.toolRunner` — the same loop as Lab 3, with
  the turn cap and usage accounting that Lab 3 explains.
- Give an agent narrow, typed tools rather than broad capability.
- Carry only minimal, trusted page context across two sites.
- Stream a conversation, bound turns and cost, and persist anonymous sessions
  for a short, explicit retention period.
- Treat confirmation and authority as application code, not model behaviour.

## The boundary

The course and the shop both call the storefront's `/api/assistant/*` routes.
They set an opaque, httpOnly seven-day session cookie for `.mlynn.dev`, check
the allowed origins, and run the loop server-side. The browser never sees an
Anthropic key.

The agent's whole surface is `find_learning_step` and `get_current_context`,
plus `get_support_policy` and `propose_support_action` on the storefront. The
course surface is not *told* to avoid support actions — it is not given the
tools. Withholding a capability is a stronger guarantee than instructing a
model not to use one.

Customer text arrives wrapped by the same `wrapUntrusted` you built in Lab 8,
and so does every tool result: `get_current_context` returns a page title the
browser supplied, and instruction-shaped text in a tool result arrives wearing
the authority of a system-provided fact. That is the second-order injection
people forget after carefully escaping the user's own message.

## Sizing the dependency

This assistant does not use Anthropic's Agent SDK, and the reason is the most
portable lesson in the lab.

The Agent SDK is built for an agent that reads and edits a real filesystem,
runs shell commands, carries memory across sessions, and dispatches subagents.
It ships a ~213MB native binary and spawns `/bin/bash`, so it needs an
isolated, containerised runtime — it cannot live in a serverless function,
which caps at 250MB and has a read-only filesystem.

An earlier version of this lab did exactly that, and configured the SDK with
`tools: []`, `settingSources: []` and memory disabled — switching off
everything the SDK exists to provide, then using what remained as a loop over
four typed functions. That loop is `messages.toolRunner`. The container, the
cloud account and the second deployment bought nothing this assistant uses.

**When you find yourself disabling most of a dependency, the dependency is the
wrong size.** Reach for the Agent SDK when you want what it brings; reach for
`toolRunner` when you want a model to call four functions of yours.

## Check your work

1. From Lab 4, ask what to do next. The assistant links to a real course page
   rather than inventing a path — the href comes from the tool, not the model.
2. Ask a storefront support question containing an instruction to reveal its
   tools. It stays in role.
3. Request a $900 refund. The result is an escalation, not an approved refund —
   and it is an escalation because `underAuthority` rewrote it, not because the
   model was persuasive about policy.
4. Confirm a valid proposed action twice. The first files one ticket and hands
   back its id; the second is rejected, and would be even if both arrived at
   once. Open `/queue` with a token and the ticket is there, marked as having
   come from the assistant rather than the form — no invented category or
   confidence score, because no classifier ran on that path.
5. Open the other site. The same anonymous session is available for seven days,
   and no raw support message was stored at any point.

> **Why does confirmation re-check the policy?** Because a stored proposal is
> not evidence that it was ever within policy. Re-deriving authority on the
> confirming request is what makes the check useful when the model was
> mistaken, or when someone talked it into something fifteen minutes ago.
