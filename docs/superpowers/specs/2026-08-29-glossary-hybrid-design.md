# Hybrid glossary expansion

**Date:** 2026-08-29  
**Status:** Implemented  
**Source of truth:** `curriculum/glossary.md`

## Goal

Turn the course glossary into a strong handrail for developers learning Claude
APIs and agentic patterns, without splitting lookup across two pages.

## Decisions

| Decision | Choice |
|---|---|
| Scope | Hybrid: course terms + curated “beyond this course” terms |
| Depth | 2–4 sentences + a when / how-it-shows-up-here line when useful |
| Organization | Single A–Z list; beyond entries marked in-card |
| Pipeline | Expand in place (Approach A); keep `##` cards + sync script |
| Auto-link | Add unambiguous **course** terms only; do not auto-link beyond terms |

## Badge convention

Beyond-course entries open with:

```md
*Beyond this course.*
```

`sync-docs.mjs` detects that lead line and adds `nw-glossary-card--beyond`.
CSS gives a quiet visual distinction. Content remains readable in GitHub/raw
markdown without CSS.

## Course gaps (add)

Agent, Workflow, Single call, Routing, Prompt chaining, Evaluator-optimizer,
Orchestrator-workers, `effort`, Thinking, `stop_reason`, `stop_details`,
Refusal, `cache_control` / cache breakpoint, `output_config`, Vision /
multimodal, Gold set, Judge, Calibration / confidence, Escalation,
Human-in-the-loop, Inference, Latency / perceived latency, Batches API,
Citation, Authority, Function calling, `budget_tokens` (pointer to `effort`).

## Beyond this course (curated)

LLM, Hallucination, Temperature / sampling, Embedding, RAG, Vector search /
vector database, Fine-tuning, Few-shot / zero-shot, MCP, Multi-agent, Agentic
loop, JSON mode, TTFT, Context stuffing, Grounding, Red teaming / adversarial
eval, Provider / foundation model, Tokenizer, Completion vs chat API,
Latency budget / SLA, Observability for LLM apps, Tool calling (industry note
folded into Function calling where useful).

## Out of scope

Provider bake-offs, full pricing tables, tutorials, Cursor product glossary
(rules / skills / subagents).

## Implementation checklist

1. Rewrite `curriculum/glossary.md` (intro + A–Z + badge lines).
2. Update `GLOSSARY_TERMS` for new course anchors (conservative).
3. Teach `wrapGlossaryCards` the beyond class.
4. CSS for `.nw-glossary-card--beyond`.
5. Spot-check sync / anchors if docs are built locally.
