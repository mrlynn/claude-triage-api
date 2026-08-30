# Glossary — Claude API and agentic terms in plain English

You do not need to memorize this page. Use it when a term interrupts your
understanding; every definition explains what it means in a program, not just
what the acronym expands to.

Entries marked *Beyond this course* are adjacent vocabulary from the wider LLM
developer space. They are not prerequisites for the labs. Everything else is
language the curriculum already uses.

---

## Agent

An **agent** is a loop where the *model* decides the next step—usually which
tool to call—based on earlier results. Contrast with a **workflow**, where
*your* code decides the sequence. In this repo, `/v1/resolve` is an agent
because which lookups run depends on what prior lookups returned.

## Agentic loop

*Beyond this course.*

An **agentic loop** (sometimes described as ReAct-style: reason → act →
observe) is the repeated cycle of model output, tool execution, and feeding
results back until the model stops or a turn limit hits. When you build one,
cap iterations and keep irreversible actions outside the loop.

## Anthropic

**Anthropic** is the company that develops Claude and operates the API this
project calls.

## API

An **application programming interface** is a way for one program to ask
another program to do something. Here, your code sends a request to Anthropic
and receives Claude's response.

## Authority

**Authority** is what your application is allowed to do—refund caps, escalation
rules, write permissions—derived from verified facts, not from the model's
word. Northwind recalculates refund authority in `authority.ts` from the tool
trace so a persuasive ticket cannot talk the system into a larger refund.

## Batches API

The **Batches API** submits many Messages requests for asynchronous processing,
usually at a discount versus synchronous calls. Use it for offline evals or
backfills; do not use it when a human is waiting on the response. Lab 9
measures how batch scheduling interacts with prompt-cache hit rates.

## `budget_tokens`

`budget_tokens` was an older thinking-budget parameter. On current models it
returns a 400; use [`effort`](#effort) inside `output_config` instead. If an
example still mentions `budget_tokens`, the example predates the rename.

## `cache_control` / cache breakpoint

`cache_control` marks a **cache breakpoint**: the API may reuse a
byte-identical request prefix up to that point at a lower input cost. Anything
that changes before the breakpoint—including a timestamp—prevents a cache hit.
Lab 5 is entirely about keeping the handbook prefix stable.

## Calibration / confidence

**Calibration** means a confidence score tracks actual correctness: wrong
answers should look less confident than right ones. Uncalibrated scores cluster
near 0.9 and are useless for routing or escalation. Lab 2 steers calibration
through Zod `.describe()` text; Lab 7 shows cheaper models lose calibration
faster than raw accuracy.

## Citation

A **citation** is a pointer to a source that supposedly supports a claim—here,
usually a policy clause id from `search_policy`. Guardrails re-check citations
against the tool trace because a fabricated clause number is more dangerous
than no citation at all.

## Claude

**Claude** is Anthropic's family of AI models. Your application does not talk
to a chatbot window; it calls a Claude model through the API and decides what
to do with the result.

## Completion vs chat API

*Beyond this course.*

Older LLM APIs exposed a raw **completion** endpoint (continue this string)
and later a **chat** endpoint (list of role-tagged messages). Claude's
Messages API is the chat-shaped surface; if you see completion-only examples,
translate them into messages with roles before copying them here.

## Content block

Claude responses contain an array of **content blocks**, not always one string.
A block can be text, thinking, tool use, image, document, and more. In
TypeScript, check a block's `type` before reading type-specific properties.
Modalities such as vision are blocks in `content`, not separate endpoints.

## Context stuffing

*Beyond this course.*

**Context stuffing** is packing large amounts of retrieved or raw text into a
prompt and hoping the model finds the answer. It burns tokens, can bury the
relevant passage, and is what good RAG ranking and prompt caching try to avoid.
Prefer a small, relevant prefix over dumping an entire corpus.

## Context window

A **context window** is the maximum amount of information a model can consider
in one request. System prompts, messages, tool definitions, and conversation
history all take up part of it.

## `effort`

`effort` (inside `output_config`) tunes how much reasoning depth—and therefore
cost and latency—the model spends. Unlike `max_tokens`, which is a hard ceiling
the model cannot see, `effort` is a signal the model responds to. Haiku rejects
`output_config.effort`; check model docs before assuming every tier accepts it.

## Embedding

*Beyond this course.*

An **embedding** is a numeric vector that represents text (or other media) so
similar meanings land near each other in vector space. Embeddings power
semantic search and RAG; they are not what Claude returns from Messages unless
you call a separate embedding model or service.

## Escalation

**Escalation** is handing a case to a human (or a higher-authority path) when
automation should not decide—low confidence, policy ceilings, safety. In
Northwind schemas this shows up as actions like `escalate_to_supervisor` and
`within_agent_authority: false`.

## Evaluation / eval

An **eval** is a repeatable test set for an AI feature. It measures whether the
system behaves correctly on representative, difficult, adversarial, and benign
inputs. An eval makes model or prompt changes observable instead of intuitive.

## Evaluator-optimizer

**Evaluator-optimizer** is a pattern where one model call produces a candidate
and another critiques or scores it, optionally looping. The judge in
`evals/lib/judge.ts` critiquing draft replies is this shape. Use it when
quality is worth a second pass; skip it when a single structured call already
passes your gold set.

## Few-shot / zero-shot

*Beyond this course.*

**Zero-shot** means asking the model to perform a task with instructions only.
**Few-shot** means including a handful of input→output examples in the prompt.
Structured outputs and tools often replace large few-shot blocks for format
control; keep examples when the *judgment* is hard to specify in rules.

## Fine-tuning

*Beyond this course.*

**Fine-tuning** updates model weights on your data so behavior shifts without
putting every example in the prompt. Prefer prompting, tools, and evals first;
fine-tune when you have a stable task, enough labeled data, and evidence that
prompting has plateaued.

## Function calling

**Function calling** is the industry name for what this course calls **tool
use**: the model emits a structured request to run a named function, your code
runs it, and you return the result. Same idea; Claude's Messages API uses the
`tools` / tool-result content-block vocabulary.

## Gold set

A **gold set** is a fixed suite of cases with known-good expected behavior used
to score the system. Lab 0 records a baseline against it; Lab 6 and Lab 7 reuse
it so model or prompt changes are comparable. Keep it adversarial on purpose—
easy cases do not teach you when the system fails.

## Grounding

*Beyond this course.*

**Grounding** means tying model claims to retrieved or verified evidence instead
of parametric memory alone. Citations checked against a tool trace are a
grounding guardrail; RAG is a grounding retrieval strategy. Ungrounded fluent
text is how hallucinations reach users looking authoritative.

## Guardrail

A **guardrail** is deterministic code around the model that enforces a rule.
For example, Northwind recalculates refund authority from verified tool results.
A guardrail is stronger than a sentence asking the model to obey a rule.

## Hallucination

*Beyond this course.*

A **hallucination** is fluent model output that is false or unsupported—
invented facts, clause numbers, or tool results. You reduce harm with tools for
live data, citation checks, structured outputs, and evals that punish confident
wrongness. Never treat fluency as evidence.

## Human-in-the-loop

**Human-in-the-loop** means a person remains responsible for consequential
steps—approving a refund, sending a customer email—while the model proposes.
Lab 10's confirm path re-derives authority in application code so the write is
never “whatever the model said.”

## Inference

**Inference** is one forward run of a model: you send a request, the provider
computes a completion, you receive tokens. A tool-using agent may require many
inferences per user request; each one adds latency and usage to the bill.

## JSON mode

*Beyond this course.*

**JSON mode** (on some providers) asks the model to emit JSON without
necessarily validating a specific schema. Claude's **structured outputs** go
further: you supply a schema and the API constrains generation to that shape.
Prefer structured outputs when another program must consume the result.

## Judge

A **judge** is a separate model call (or rubric scorer) that grades another
component's output—draft quality, policy adherence, preference. Pin the judge
model when comparing tiers so the grader does not move under your feet. See
Lab 6 and the evaluator-optimizer pattern.

## Latency / perceived latency

**Latency** is wall-clock time until a useful result. **Perceived latency** is
what a waiting human feels: streaming first tokens often matters more than
total time. Lab 4 exists because agents abandon a draft that sits silent for
fifteen seconds even if the final text is fine.

## Latency budget / SLA

*Beyond this course.*

A **latency budget** or **SLA** is the maximum time your product can spend
before the experience fails (timeout, abandoned chat, missed IVR turn). Pick
models and agent depth against that budget with measurements, not vibes—Lab 7's
latency column is only meaningful once you know what “fast enough” is.

## LLM

*Beyond this course.*

An **LLM** (large language model) is a model trained to predict and generate
text at scale. Claude is an LLM family exposed through an API; your app's job
is to constrain, tool, evaluate, and guardrail it—not to treat it as a
database or an autonomous employee.

## `max_tokens`

`max_tokens` is an enforced maximum for generated output. If Claude reaches it,
the response can be cut off even though the API call succeeded. Check
`stop_reason` instead of guessing from punctuation.

## MCP

*Beyond this course.*

**MCP** (Model Context Protocol) is an open standard for connecting AI
applications to external tools and data sources through a common client/server
shape. It is complementary to Claude's native `tools` parameter: MCP is how
hosts discover and call capabilities; Messages tool use is how a single API
request asks Claude to invoke them.

## Messages API

The **Messages API** is the main Claude API surface used here. You send a list
of messages plus options such as a model and token limit; Claude returns a
message containing content blocks, a stop reason, and usage.

## Model

A **model** is the particular Claude engine that generates a response. Models
differ in cost, speed, context window, and performance on your own tasks.
Choose the cheapest one that passes your evaluation—not the one with the most
impressive name.

## Multi-agent

*Beyond this course.*

**Multi-agent** designs assign specialized roles to separate model instances
(researcher, coder, reviewer) that coordinate. Powerful and expensive; most
support problems need one agent with bounded tools or a fixed workflow. This
repo deliberately skips orchestrator-workers for that reason.

## Observability for LLM apps

*Beyond this course.*

**Observability** for LLM apps means tracing prompts, tool calls, token usage,
latency, cache hits, and eval scores so failures are debuggable. Log the tool
trace and usage the way you would log SQL—without those, “the model was weird”
is not an incident report.

## Orchestrator-workers

**Orchestrator-workers** is a pattern where one model decomposes a task and
farms subtasks to other calls. Nothing in Northwind needs that: `/v1/resolve`
tools are known and bounded. Lab 9 asks you to name the pattern you *did not*
build and defend the omission.

## `output_config`

`output_config` is the Messages parameter object that carries structured-output
format (and `effort` on supported models). It is how Lab 2 constrains triage
JSON without parsing freestyle prose. Capabilities are fields on one request—
not separate APIs.

## Prompt

A **prompt** is the information sent to Claude to guide a response. It can
include system instructions, user messages, tool definitions, and previous
conversation. A prompt is input to the model, not a program that it executes.

## Prompt caching

**Prompt caching** reuses a large, unchanged beginning of a request at a lower
input cost. It is a prefix match: changing text before the cache breakpoint,
including a timestamp, prevents a cache hit.

## Prompt chaining

**Prompt chaining** is a fixed sequence of calls where each step's output feeds
the next—your code owns the order. Northwind's triage → resolve → draft path
is a chain. Prefer a chain when the steps are known; prefer an agent when the
next lookup depends on prior results.

## Prompt injection / untrusted input

**Prompt injection** is text in user-controlled data that tries to change the
model's instructions. Treat public text as untrusted data, delimit and escape
it structurally, redact sensitive information, and enforce important rules in
server code.

## Provider / foundation model

*Beyond this course.*

A **provider** hosts inference (Anthropic, OpenAI, and others). A **foundation
model** is the base model those APIs expose. Your architecture should isolate
provider SDKs behind thin adapters so evals and guardrails survive a model or
vendor change.

## RAG

*Beyond this course.*

**RAG** (retrieval-augmented generation) fetches relevant documents at request
time and puts them in the prompt so the model can answer from that evidence.
Northwind's `search_policy` tool is a minimal, tool-shaped cousin: retrieve
then generate, with citations checked afterward.

## Rate limit

A **rate limit** is a provider-enforced limit on how quickly an API can accept
requests or tokens. A well-behaved client reads the response headers, backs
off, and retries only when the error is retryable.

## Red teaming / adversarial eval

*Beyond this course.*

**Red teaming** (and adversarial eval cases) deliberately try to break the
system—injection, authority abuse, jailbreaks, nasty edge tickets. Lab 0/6 gold
sets include adversarial items for the same reason security tests include
malicious inputs: happy-path scores lie.

## Refusal

A **refusal** is when the model stops because the request violates safety or
usage rules (`stop_reason` of `refusal`). Read `stop_details` only in that
case; it is `null` otherwise. Handle refusals as a first-class UI state, not as
generic empty text.

## Routing

**Routing** classifies an input and sends it down a specialized path—to a human
queue, a model tier, or a workflow branch. `/v1/triage` routes work for agents;
`pickModel` routes among models. Routing is only as good as the signals you
threshold on (category, confidence calibration, policy flags).

## SDK

An **SDK** is a library that makes an API pleasant to call from a programming
language. `@anthropic-ai/sdk` is the TypeScript SDK used in this repository.
It turns a Messages API request into `client.messages.create(...)`.

## Single call

A **single call** is one Messages request that produces the answer—no tool
loop, no multi-step orchestration. `/v1/triage` and `/v1/draft` are single
calls. Start here; promote to a workflow or agent only when the task earns the
extra latency and cost.

## `stop_details`

`stop_details` carries extra information when the model refuses. It is
populated only when `stop_reason === "refusal"`; otherwise it is `null`. Always
guard before reading it or your client will throw on ordinary completions.

## `stop_reason`

`stop_reason` tells you why generation ended—end turn, max tokens, tool use,
refusal, and similar. Always branch on it: `max_tokens` means truncation,
`tool_use` means you must run tools, `refusal` means check `stop_details`.

## Streaming / SSE

**Streaming** sends a response as it is generated rather than waiting for all
of it. This project uses **Server-Sent Events (SSE)**, a simple HTTP stream of
named events. A streaming client must handle both the final `done` event and an
in-band `error` event.

## Structured outputs / schema

A **schema** defines the data shape your program accepts: allowed categories,
required fields, and value types. **Structured outputs** constrain the model to
that shape and validate the result, so code does not have to gamble on a
prompt that says “return JSON.”

## System prompt

The **system prompt** gives a model its role and rules—for example, Northwind's
support policy. Keep repeated, unchanging system content stable when using
prompt caching.

## Temperature / sampling

*Beyond this course.*

**Temperature** (and related sampling controls) adjusts how randomly the model
picks the next token: lower is more deterministic, higher is more varied. For
classification and tool selection, keep sampling conservative; save creativity
for drafts where diversity is a feature.

## Thinking

**Thinking** is the model's internal reasoning pass. It is billed whether or
not you display it. The `display` setting only controls whether you receive a
summarized thinking block (`"summarized"`) or omit it (`"omitted"`, the
default). In streaming UIs, omitted thinking looks like a long silent pause—
Lab 4 makes that concrete.

## Token

A **token** is a small piece of text that models read and generate. API pricing
and `max_tokens` use tokens, not words. Input tokens are what you send;
output tokens are what Claude generates.

## Tokenizer

*Beyond this course.*

A **tokenizer** splits text into the tokens a model was trained on. Different
families tokenize differently, so word count is a poor cost estimate—use
`count_tokens` or measured usage. Weird spacing and code often expand token
counts more than prose of the same length.

## Tool trace

A **tool trace** records every tool call and result in order. It lets a person
audit what facts informed an answer and lets server-side guardrails recompute
what the model is allowed to recommend.

## Tool use

**Tool use** lets Claude ask your program to run a named function, such as
looking up an order. Your program runs the tool, returns its result, and Claude
uses that result in the next turn. Tools retrieve or compute facts; they are
not permission to let the model perform unrestricted actions.

## TTFT

*Beyond this course.*

**TTFT** (time to first token) is how long until the client receives the first
streamed token. It dominates perceived latency for chat UIs. Streaming helps
TTFT; waiting for a full tool loop before any bytes does not.

## Usage and cost

**Usage** reports how many tokens a request consumed. For cached work, total
input is fresh input plus cache writes plus cache reads. For a tool loop, sum
usage across every turn—one final response does not represent the full bill.

## Vector search / vector database

*Beyond this course.*

**Vector search** finds items whose embeddings are nearest to a query embedding.
A **vector database** stores those embeddings for fast similarity query. Use
them when keyword search misses paraphrase; still verify what you insert into
the prompt, the same as any other untrusted retrieved text.

## Vision / multimodal

**Vision** (and **multimodal** inputs more generally) means the model can take
non-text content such as images as content blocks on the same Messages request.
It is not a fifth API and not a separate product surface here: `/v1/triage` can
accept a photo on the same structured-output path as text.

## Workflow

A **workflow** is a multi-step AI feature where *your* code decides the order of
calls and what each step receives. It is more predictable than an agent and
usually cheaper to debug. Promote a single call to a workflow when steps are
known; promote a workflow to an agent only when branching must be model-chosen.
