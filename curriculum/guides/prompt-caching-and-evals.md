# Claude prompt caching and evals: measure before optimizing

Prompt caching lowers input cost when many requests share a long, stable prefix such as a policy handbook. Evals tell you whether the change preserved the behavior you need. Use them together: caching without measurement can hide a cost regression, and evaluation without usage data can miss the cost of an otherwise correct system.

## How prompt caching works

Cache the stable prefix, then place changing context after the breakpoint:

```ts
system: [
  {
    type: "text",
    text: `${ROLE_INSTRUCTIONS}\n\n${POLICY_HANDBOOK}`,
    cache_control: { type: "ephemeral" },
  },
  { type: "text", text: `Channel: ${ticket.channel}` },
]
```

The cache is a byte-for-byte prefix match. A timestamp, reordered tools, or volatile customer context ahead of the breakpoint can silently turn every cache hit into a miss. HTTP 200 and a correct answer do not mean the cache works; inspect `cache_read_input_tokens`.

## A minimal evaluation loop

1. Save a baseline across representative cases before changing the prompt or model.
2. Include safety-critical, ambiguous, adversarial, and multi-intent cases—not just easy examples.
3. Score deterministic requirements against explicit expected fields.
4. Use an LLM judge for subjective quality only with a concrete rubric and evidence requirements.
5. Compare quality, latency, and usage before promoting the change.

## Two costly misconceptions

- **“Caching always saves money.”** A cache write costs more than uncached input; it pays off only when the prefix is reused within its lifetime.
- **“An LLM judge is a CI gate.”** Judges vary. Validate the rubric and treat a small, subjective judge as diagnostic evidence unless you have established its reliability.

## Go deeper

[Lab 5: prompt caching and cost](../labs/lab-5-prompt-caching.md) has you break a cache four ways and read the accounting. [Lab 6: eval design and LLM-as-judge](../labs/lab-6-evals.md) turns the course’s critical failures into a test suite. The [cache inspector](https://triage.mlynn.dev/playground/cache) is the fastest no-setup introduction.
