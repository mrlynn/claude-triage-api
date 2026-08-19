# Lab 3 — answers

**Q1. What changes if you delete the prescribed 4-step method?**

The trace becomes less predictable: Claude may skip the customer lookup when
the ticket text looks self-explanatory, or search policy before it knows what
the order actually contains. The final answer is often still correct — the
model is capable of reaching it — but you lose the property that *every*
decision was made against verified facts in a fixed order.

That property is what makes the trace auditable. A support supervisor reviewing
a refund needs to see that the account standing was checked, not infer that it
probably was. Prescribing method in the system prompt is how you convert
"usually does the right thing" into "demonstrably did these things."

**Q2. What changes when the description becomes "Looks up an order."?**

The tool gets called less often and less reliably — most visibly, Claude starts
accepting order facts asserted in the customer's own message instead of
verifying them, because nothing told it not to.

The rule the original follows: **state when to call it and what not to do
without it**, not merely what it returns. "Call this before stating any fact
about an order — never rely on what the customer claims" is a behavioral
instruction. "Looks up an order" is a type signature. The model already knows
the type signature; it is in the schema.

**Q3. Express the under-reporting factor.**

Not `1/N`, because the conversation grows monotonically: each turn resends all
prior messages plus the new tool results, so turn *k* has more input tokens
than turn *k−1*. The last turn is therefore the single most expensive one.

Reporting only the final turn under-reports total input by the sum of all
earlier turns' input. For an N-turn loop with roughly linear growth, total
input is on the order of N(N+1)/2 units while the last turn is N units — so
the reported figure is roughly `2/(N+1)` of the truth. At 5 turns you report
about a third of actual input, not a fifth. Output tokens under-report closer
to 1/N since they don't accumulate.

Either way the answer is the same: sum every turn.

**Q4. Why is hitting the cap dangerous?**

Because it fails *silently and plausibly*. The response is HTTP 200, the body
validates against `ResolutionSchema`, and the recommendation reads as
confident — but it was made without the lookups Claude was still trying to
perform. A schema-valid answer built on missing facts is worse than an error,
because nothing downstream will question it.

Production should treat `hit_iteration_cap === true` as a failure: return a
502 or route to a human, and alert. Never return a capped result as if it were
a completed one. Raising the cap is not the fix — the fix is knowing when you
hit it.

**Q5. Why have `check_refund_authority` as a tool at all?**

*For it:* the threshold is policy, not arithmetic. Putting it in a tool means
it lives in one place, changes without touching a prompt, is unit-testable, is
logged in the trace as an explicit check, and cannot be "reasoned around" by a
model that decides $210 is close enough. Determinism about money is worth a
round trip.

*Against it:* if the threshold is already stated in a cached system prompt and
the decision is a single comparison with no audit requirement, the tool adds a
round trip and an inference for something the model does reliably. For a
low-stakes, non-audited threshold, skip it.

The general rule: move deterministic logic out of the model when correctness
matters or when you need the decision on the record. Leave it in when it is
cheap and inconsequential.

---

## Extension 1 — redaction

Redact at the ingress boundary (in `TicketInput`, before the message ever
reaches `buildSystem`), not by instructing the model in the prompt. Three
reasons:

1. A prompt instruction is a request; a boundary transform is a guarantee.
2. If you redact in the prompt, the raw digits are still in your request logs,
   your traces, and Anthropic's request payload. The data has already left.
3. Boundary redaction is testable without calling the API at all.

The general principle: **security controls belong in code, not in prompts.**
A prompt is the wrong layer for anything you must be able to prove.

## Extension 2 — human-in-the-loop

Gate inside `run()`:

```ts
run: record("check_refund_authority", ({ amount_usd }) => {
  if (amount_usd > 200) {
    return { approved: false, requires: "supervisor",
             note: "Not authorized. Recommend escalate_to_supervisor." };
  }
  return { approved: true, requires: null };
}),
```

You do not need a manual loop for approval gates. Returning a "declined" result
from the tool keeps the loop intact and lets Claude adapt its plan — which is
exactly what you want it to do.
