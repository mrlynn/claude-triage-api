# Lab 2 — Structured outputs and schema design

**Time:** 35 minutes · **Prerequisites:** Lab 1

## Why this matters

Northwind already had a classifier that hit 84% accuracy. They cancelled it.

Not because 84% was too low, but because when it routed a safety report to
billing, nobody could say why, and nobody could fix that one case without
retraining the whole thing. It also reported high confidence on everything,
including the cases it got wrong, which made the confidence score worse than
useless — it actively misled the supervisors who tried to route on it.

This lab is where you build the thing that replaces it. A schema is not
plumbing for getting JSON out of a model. It is where you decide what the system
is allowed to say, what it must commit to, and how it is required to express
doubt. The `confidence` field you tune in Step 2 is the direct answer to the
last sentence of Priya's brief: *do not tell me you are 95% sure when you are
guessing.*

Get that field wrong and you ship the 2024 classifier again.

---

> **See what the fields are for.** The
> [inbound queue](https://claude-triage-labs.vercel.app/playground/queue) runs
> this schema over twenty tickets and sorts a real support queue with the
> result. Every classification there came from the code you are about to edit.

## Objectives

- Constrain output with `output_config.format` and validate with `messages.parse()`
- Explain why `.describe()` is prompt engineering, not documentation
- Design an enum that fails safely
- Measure whether a confidence score carries any information

---

## Step 1 — see the mechanism

Read [`src/routes/triage.ts`](../../src/routes/triage.ts) and
[`src/schemas.ts`](../../src/schemas.ts). Two lines do the work:

```ts
output_config: { effort: EFFORT.triage, format: zodOutputFormat(TriageSchema) }
```

```ts
const response = await anthropic.messages.parse({ ... });
response.parsed_output; // TriageResult | null
```

Note what is **absent**: no "respond only with JSON" in the prompt, no
`JSON.parse` in a `try/catch`, no repair-and-retry loop.

Run it:

```bash
curl -s localhost:8787/v1/triage -H 'content-type: application/json' -d '{
  "message":"Order NW-48211 arrived Monday and the zipper separated the second time I wore it. I want a replacement."
}' | jq .triage
```

**Q1.** `parsed_output` is typed `TriageResult | null`. Under what circumstance
is it null, and what should a production service do then?

## Step 2 — prove that `.describe()` steers the model

Open `src/schemas.ts` and find the `confidence` field. Delete its `.describe()`
call, leaving only `z.number().min(0).max(1)`.

Run the eval to get a distribution across 12 diverse cases:

```bash
npm run eval 2>&1 | grep -E "conf=|mean confidence"
```

Record the two "mean confidence" lines. Now restore the `.describe()` and run
again.

**Q2.** What happened to the gap between mean confidence on passes and on
failures? Why does that gap — not the absolute value — determine whether the
field is usable?

> **The general principle:** `.describe()` text is compiled into the JSON
> Schema sent to the model. It is the highest-leverage per-field control you
> have. A schema with bare types gets you well-formed output; a schema with
> good descriptions gets you *correct* output.

## Step 3 — design an enum that fails safely

`CategoryEnum` includes `other`. Consider two designs:

**A.** `["billing","shipping","product_defect","returns","account","safety","other"]`
**B.** `["billing","shipping","product_defect","returns","account","safety"]` — no escape hatch

Test B by editing the enum and sending a message that fits nothing:

```bash
curl -s localhost:8787/v1/triage -H 'content-type: application/json' \
  -d '{"message":"Do you sponsor trail races? We run a 50k in Vermont."}' | jq .triage
```

**Q3.** With design B the model must pick a wrong category — the constraint
guarantees a *well-formed* answer, not a *true* one. What does the handbook's
section 8 guidance ("do not use `other` as a dumping ground; pick the closest
real category and lower the confidence instead") buy you that neither design
gives on its own?

## Step 4 — add a field

Add to `TriageSchema`:

```ts
language: z.enum(["en","es","fr","de","other"]).describe(
  "The language the customer wrote in, by ISO-639-1 code. Detect from the " +
  "message text only; do not infer from the customer's name or region."
),
```

Restore the enum from Step 3 first. Then run triage on a Spanish message.

**Q4.** You changed the schema and nothing else. Name every place in this
codebase you would have had to edit if the shape were defined in a prompt
string plus a hand-written interface instead.

## Step 5 — the cost of shape

Structured outputs are not free: the schema is tokens in the request.

```bash
curl -s localhost:8787/v1/estimate -H 'content-type: application/json' \
  -d '{"message":"test","role":"triage"}' | jq .tokens
```

**Q5.** For a schema with 20 fields and long descriptions, where would you put
the `cache_control` breakpoint so the schema cost is paid once rather than per
request? (Hint: re-read the render order in the concept map.)

---

## Checkpoint

- [ ] Which parameter constrains output shape, and where does it live?
- [ ] Why is `.describe()` load-bearing?
- [ ] When is an `other` enum member correct, and when is it a bug magnet?
- [ ] What does structured output guarantee — and what does it *not*?

---

## Extension

Make `escalation_reason` a discriminated union: `null` when `requires_human` is
false, and a required non-empty string otherwise. Zod can express this; the
JSON Schema the API accepts may not represent it fully. Determine empirically
whether the constraint is enforced by the API or only by your local validation,
and write down which layer is actually protecting you.

**Answers:** [../solutions/lab-2.md](../solutions/lab-2.md)
