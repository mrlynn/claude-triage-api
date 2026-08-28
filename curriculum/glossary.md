# Glossary — Claude API terms in plain English

You do not need to memorize this page. Use it when a term interrupts your
understanding; every definition explains what it means in a program, not just
what the acronym expands to.

## API

An **application programming interface** is a way for one program to ask
another program to do something. Here, your code sends a request to Anthropic
and receives Claude's response.

## Anthropic

**Anthropic** is the company that develops Claude and operates the API this
project calls.

## Claude

**Claude** is Anthropic's family of AI models. Your application does not talk
to a chatbot window; it calls a Claude model through the API and decides what
to do with the result.

## Model

A **model** is the particular Claude engine that generates a response. Models
differ in cost, speed, context window, and performance on your own tasks.
Choose the cheapest one that passes your evaluation—not the one with the most
impressive name.

## SDK

An **SDK** is a library that makes an API pleasant to call from a programming
language. `@anthropic-ai/sdk` is the TypeScript SDK used in this repository.
It turns a Messages API request into `client.messages.create(...)`.

## Messages API

The **Messages API** is the main Claude API surface used here. You send a list
of messages plus options such as a model and token limit; Claude returns a
message containing content blocks, a stop reason, and usage.

## Prompt

A **prompt** is the information sent to Claude to guide a response. It can
include system instructions, user messages, tool definitions, and previous
conversation. A prompt is input to the model, not a program that it executes.

## System prompt

The **system prompt** gives a model its role and rules—for example, Northwind's
support policy. Keep repeated, unchanging system content stable when using
prompt caching.

## Token

A **token** is a small piece of text that models read and generate. API pricing
and `max_tokens` use tokens, not words. Input tokens are what you send;
output tokens are what Claude generates.

## Context window

A **context window** is the maximum amount of information a model can consider
in one request. System prompts, messages, tool definitions, and conversation
history all take up part of it.

## `max_tokens`

`max_tokens` is an enforced maximum for generated output. If Claude reaches it,
the response can be cut off even though the API call succeeded. Check
`stop_reason` instead of guessing from punctuation.

## Content block

Claude responses contain an array of **content blocks**, not always one string.
A block can be text, thinking, tool use, and more. In TypeScript, check a
block's `type` before reading properties specific to text.

## Structured outputs / schema

A **schema** defines the data shape your program accepts: allowed categories,
required fields, and value types. **Structured outputs** constrain the model to
that shape and validate the result, so code does not have to gamble on a
prompt that says “return JSON.”

## Tool use

**Tool use** lets Claude ask your program to run a named function, such as
looking up an order. Your program runs the tool, returns its result, and Claude
uses that result in the next turn. Tools retrieve or compute facts; they are
not permission to let the model perform unrestricted actions.

## Tool trace

A **tool trace** records every tool call and result in order. It lets a person
audit what facts informed an answer and lets server-side guardrails recompute
what the model is allowed to recommend.

## Guardrail

A **guardrail** is deterministic code around the model that enforces a rule.
For example, Northwind recalculates refund authority from verified tool results.
A guardrail is stronger than a sentence asking the model to obey a rule.

## Streaming / SSE

**Streaming** sends a response as it is generated rather than waiting for all
of it. This project uses **Server-Sent Events (SSE)**, a simple HTTP stream of
named events. A streaming client must handle both the final `done` event and an
in-band `error` event.

## Prompt caching

**Prompt caching** reuses a large, unchanged beginning of a request at a lower
input cost. It is a prefix match: changing text before the cache breakpoint,
including a timestamp, prevents a cache hit.

## Rate limit

A **rate limit** is a provider-enforced limit on how quickly an API can accept
requests or tokens. A well-behaved client reads the response headers, backs
off, and retries only when the error is retryable.

## Usage and cost

**Usage** reports how many tokens a request consumed. For cached work, total
input is fresh input plus cache writes plus cache reads. For a tool loop, sum
usage across every turn—one final response does not represent the full bill.

## Evaluation / eval

An **eval** is a repeatable test set for an AI feature. It measures whether the
system behaves correctly on representative, difficult, adversarial, and benign
inputs. An eval makes model or prompt changes observable instead of intuitive.

## Prompt injection / untrusted input

**Prompt injection** is text in user-controlled data that tries to change the
model's instructions. Treat public text as untrusted data, delimit and escape
it structurally, redact sensitive information, and enforce important rules in
server code.
