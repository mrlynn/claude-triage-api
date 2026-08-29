# Lab 10 — Ask Northwind

**Time:** 45 minutes · **Prerequisites:** Lab 3, Lab 8 · **No API key required**

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

---

```quiz
[
  {
    "question": "The assistant can investigate a refund request but has no tool that files a ticket. Filing happens on a separate confirmation request. Why not simply give it a `file_ticket` tool?",
    "options": [
      "A tool call is slower than a second HTTP request",
      "Because the write would then happen on the model's say-so, and a persuaded model would file real tickets",
      "The Messages API does not allow tools that write"
    ],
    "answer": 1,
    "explain": "The whole arrangement exists to keep a state change off the model's judgement. A tool the model can call is a capability the model can be talked into using — and Lab 8 already showed that instructions hold only by probability. Splitting the write onto a confirming request moves it behind application code that re-derives authority. Option 3 is false: tools can do anything your handler does, which is exactly the problem.",
    "note": "Withholding a capability is a stronger guarantee than instructing a model not to use one. The course surface is not told to avoid support actions — it is not given the tools."
  },
  {
    "question": "An earlier version of this assistant ran on the Agent SDK configured with `tools: []`, `settingSources: []`, and memory disabled. What does that configuration tell you?",
    "options": [
      "The dependency is the wrong size — everything it exists to provide was switched off",
      "The SDK was misconfigured and should have been given tools",
      "Nothing — disabling defaults is normal hardening"
    ],
    "answer": 0,
    "explain": "What survived that configuration was a loop over four typed functions, which is `messages.toolRunner` — and the SDK's price for it was a ~213MB binary, a container host, and a second deployment. The Agent SDK is the right answer for an agent that reads a filesystem, runs a shell, carries memory, or dispatches subagents. This assistant does none of those. Option 3 confuses turning off a default with turning off the product.",
    "note": "The transferable rule: when you find yourself disabling most of a dependency, the dependency is the wrong size."
  }
]
```

---

## Checkpoint

You should be able to answer, without looking anything up:

- [ ] Why is the confirmation the write, rather than a tool the agent can call?
- [ ] Why does the confirming request re-derive authority instead of trusting
      the stored proposal?
- [ ] Why does a tool result need `wrapUntrusted` when the user's message was
      already wrapped?
- [ ] What would have to be true of this assistant for the Agent SDK to be the
      right dependency?

---

## Extension

Give the course surface the storefront's `propose_support_action` tool and ask
it, from a lab page, to refund an order. Then take the tool away again and try
to talk it into the same outcome with the tool absent. The difference between
those two transcripts is the argument for scoping tools per surface, and it is
much more convincing to run than to read.

**Answers:** [../solutions/lab-10.md](../solutions/lab-10.md)
