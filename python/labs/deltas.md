# The Python deltas

Read the TypeScript labs. They carry the teaching, and most of what this course
is about — schema design, calibration, caching, the trust boundary, the batch
arithmetic — is a property of the API, not of a language.

This page is only what is genuinely different. It is short on purpose.

Everything below was hit while porting `src/` to `python/`, not recalled.

---

## 1. `output_format` is a separate parameter

The one that actually stops you.

```ts
// TypeScript — both live inside output_config
output_config: {
  effort: EFFORT.triage,
  format: zodOutputFormat(TriageSchema),
}
```

```python
# Python — the schema is a TOP-LEVEL argument to parse()
output_config={"effort": EFFORT["triage"]},
output_format=TriageResult,
```

Put the pydantic class inside `output_config["format"]` and you get:

```
TypeError: Object of type ModelMetaclass is not JSON serializable
```

which points at the JSON encoder rather than at the mistake. `messages.parse()`
in the Python SDK takes `output_format: type[ResponseFormatT]` alongside
`output_config`, not inside it.

## 2. `parsed_output` is the same in both

Worth stating because you will go looking for a difference. It is
`response.parsed_output` in Python and in TypeScript, and it is nullable in
both. The Python type is your pydantic model rather than an inferred Zod type,
and `None` rather than `null`, and that is the whole of it.

## 3. `timeout` is seconds here, milliseconds there

```ts
new Anthropic({ maxRetries: 3, timeout: 120_000 });   // ms
```

```python
anthropic.Anthropic(max_retries=3, timeout=120.0)      # seconds
```

Both default to ten minutes. Copying the number across without converting
gives you either a 120-millisecond timeout that fails every call, or a
120,000-second one that never fires. The second is worse, because it looks
fine.

Also `max_retries` / `maxRetries` — snake case throughout the Python SDK.

## 4. The two SDKs do not share a prompt cache

This one is subtle and it surprised us.

The system prompts are **byte-identical** — same role text, same handbook file,
10,937 characters in both. And yet:

```
TypeScript:  cache_creation_input_tokens 5022,  cache_read 0
Python:      cache_creation_input_tokens 0,     cache_read 4970
```

Two different cache entries, 52 tokens apart. The prompts are not the
difference; **the generated JSON Schema is**. Zod emits 2,497 characters for
`TriageSchema`; pydantic emits 2,441 for the same logical model — different
key ordering, a `$defs` block, a `$schema` declaration. The schema is part of
what gets cached, so a difference there is a different prefix.

Two things follow:

- Running both services in parallel does not halve your cache costs. Each pays
  its own write.
- "Byte-identical prompt" is not sufficient for a cache hit. Everything ahead
  of the breakpoint counts, and that includes things you did not write by hand.

## 5. Field descriptions are the prompt, and porting is where you lose them

The most valuable thing in this port, and it cost three eval cases.

The first version of `triage/schemas.py` paraphrased the field descriptions
instead of copying them. In particular, `requires_human` went from:

> True if policy section 5.3 mandates supervisor escalation, **or if a
> confident automated reply is not possible.**

to a tidier-looking version that dropped the second clause and listed the 5.3
triggers instead. Everything type-checked. The service ran. The schema was
valid.

**Accuracy went from 11/12 to 8/12**, and both new failures were
`requires_human: expected True, got False` on exactly the cases that turn on
"a confident automated reply is not possible" — the deliberately ambiguous one
and the repeat-contact one.

Restoring the sentence restored the score.

This is [Lab 2](../../curriculum/labs/lab-2-structured-outputs.md) Step 2
happening for real, in a context where it is much easier to make the mistake:
translating a schema *feels* like moving types around, and the types are the
part that does not matter. The descriptions are the prompt.

If you port this to a third language, copy the description strings verbatim
before you write anything else.

## 6. Small stuff

| | TypeScript | Python |
|---|---|---|
| Request shape | one object argument | `**kwargs` |
| Schema | Zod + `zodOutputFormat` | pydantic class directly |
| Server | Hono, `app.request()` in-process | FastAPI, `TestClient` in-process |
| Naming | `camelCase` | `snake_case` throughout the SDK |
| Module name | `requests.ts` would be fine | `requests_.py` — do not shadow the `requests` library |

The in-process testing pattern survives intact: `TestClient(app)` is FastAPI's
equivalent of Hono's `app.request()`, so the eval harness never opens a port
and never needs a running server. That is one of the better ideas in the
TypeScript half and it ports cleanly.

---

## What is not here

The Python track mirrors `/v1/triage` and the scoreboard. It does not
reimplement tool use, streaming, the tool-use guardrails, the batch script, or
MCP.

That is deliberate rather than unfinished. Those labs teach ideas — the usage
trap in an agent loop, SSE and client disconnects, deterministic authority
checks, the batch-versus-cache arithmetic — and every one of those ideas is
identical in Python. Reimplementing them would produce a second thing to
maintain and a second thing to drift, in exchange for teaching nothing new.

The four differences above are the ones a Python developer actually needs, and
`/v1/triage` is enough surface to demonstrate all four.
