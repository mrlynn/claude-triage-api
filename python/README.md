# The Python track

The same service, in Python, for people who will build this on FastAPI rather
than on Hono.

**This is not a translation exercise.** Read the TypeScript labs — they carry
the teaching — and use [`labs/deltas.md`](labs/deltas.md) for what is genuinely
different in Python. That file is short on purpose: most of what the course
teaches is about the API, and the API does not change language.

## Run it

```bash
uv venv && uv pip install -e .
```

```bash
.venv/bin/uvicorn triage.server:app --port 8788 --reload
```

```bash
.venv/bin/python -m evals.quick
```

Port 8788 rather than 8787, so the TypeScript service and this one can run side
by side — which is the fastest way to check that a behaviour you are unsure
about is the API and not your code.

## What is here

| File | Mirrors |
|---|---|
| `triage/config.py` | `src/config.ts` |
| `triage/client.py` | `src/anthropic.ts` |
| `triage/schemas.py` | `src/schemas.ts` |
| `triage/prompts.py` | `src/prompts.ts` |
| `triage/usage.py` | `src/lib/usage.ts` |
| `triage/untrusted.py` | `src/lib/untrusted.ts` |
| `triage/requests_.py` | `src/lib/requests.ts` |
| `triage/server.py` | `src/server.ts` + `src/routes/` |
| `evals/quick.py` | `evals/quick.ts` |

The data — `data/policies.md`, `evals/dataset.jsonl` — is read from the repo
root. There is one gold set, not two, and that is deliberate: two copies of a
gold set drift, and then you are comparing languages rather than measuring
either.
