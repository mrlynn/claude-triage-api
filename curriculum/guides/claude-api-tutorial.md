# Claude API tutorial: build a support-triage service

The fastest useful way to learn the Claude API is to build one small service that has to make real engineering tradeoffs. This tutorial uses a customer-support triage API: it classifies an incoming ticket, decides when a person must review it, and measures whether the result is reliable.

You need Node 20+, an Anthropic API key, and about 20 minutes for the first working request. The complete course takes about four hours and costs approximately $2–4 in API usage.

## What you will build

- A typed ticket classifier using structured outputs
- A tool-using resolution step that checks orders and policy rather than trusting customer claims
- A streaming reply endpoint with cost accounting
- A cached policy prefix and an eval suite to prove changes help

## Make your first Claude API request

Install the SDK and create a request with a model and a message:

```ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 200,
  messages: [{ role: "user", content: "Classify this support ticket: My jacket zipper broke." }],
});
```

That request proves connectivity, but it is not a service contract. A production caller needs predictable fields, evidence for consequential decisions, cost visibility, and a way to detect regressions. Those are the four layers the course adds.

## Common mistakes

- Treating a valid HTTP response as proof the answer is correct. Measure representative cases before relying on it.
- Asking for JSON in a prompt and parsing it by hand. Use structured outputs when code depends on the response shape.
- Building an agent loop without a maximum iteration count or total-usage accounting.
- Optimizing a prompt before recording a baseline.

## Continue with the hands-on course

Start with [Lab 1: your first call](../labs/lab-1-first-call.md), then take the labs in order. If you are new to the vocabulary, begin with [Start from zero](https://triage.mlynn.dev/start). For the full design context, read [the Northwind scenario](../scenario.md).
