# Claude structured outputs with TypeScript and Zod

Claude structured outputs let you give the model a schema and receive a validated, typed result instead of hoping a prose instruction produces parseable JSON. In TypeScript, define the schema once with Zod, use it to constrain the API response, and handle the possibility that no parsed result is available.

## The essential pattern

```ts
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const TriageSchema = z.object({
  category: z.enum(["billing", "shipping", "product_defect", "safety", "other"]),
  requires_human: z.boolean(),
  confidence: z.number().min(0).max(1).describe(
    "How likely this classification is correct. Use lower values for ambiguous cases.",
  ),
});

const response = await anthropic.messages.parse({
  model: "claude-opus-5",
  max_tokens: 16000, // adaptive thinking counts against this; a low ceiling truncates the JSON
  messages: [{ role: "user", content: ticket }],
  output_config: { format: zodOutputFormat(TriageSchema) },
});

const triage = response.parsed_output; // TriageResult | null
```

When `parsed_output` is `null`, check `response.stop_reason` before calling it a parse failure: `"max_tokens"` means the JSON was truncated, and `"refusal"` means the model declined (read `response.stop_details`).

Two limits worth knowing. The API constrains generation to the schema's *structure*, but it does not support numeric bounds like `.min(0).max(1)`; the SDK helper moves those into the description and checks them on your side after the response arrives. And discriminated unions via `anyOf`, recursive schemas, and string length constraints are not supported by the API's schema compiler.

The schema gives application code a dependable output shape. It does **not** make the classification correct. The right next step is to evaluate it on examples that represent the failures your system cannot afford.

## Design rules that prevent expensive mistakes

- Treat field descriptions as instructions to the model, not comments for developers.
- Include a safe fallback category, but define when it should be used.
- Make confidence operational: specify what low confidence means and where humans intervene.
- Keep the null case explicit. A parsed field is not a license for a non-null assertion.
- Test semantic correctness separately from schema validity.

## Failure mode to look for

If every answer reports confidence around 0.9, the field is decorative. Compare average confidence on passing and failing eval cases; a useful confidence score separates them.

## Go deeper

[Lab 2: structured outputs and schema design](../labs/lab-2-structured-outputs.md) turns this into a complete support-ticket contract, deliberately breaks its field instructions, and measures the impact. The [inbound queue](https://triage.mlynn.dev/playground/queue) shows the schema running against a real set of cases.
