/**
 * Zod schemas that double as the API's response contract AND the model's
 * output contract.
 *
 * TEACHING NOTE: this is the highest-leverage idea in the whole project. One
 * schema, three jobs:
 *   1. `zodOutputFormat(TriageSchema)` constrains what Claude may emit.
 *   2. `client.messages.parse()` validates and types the response.
 *   3. The same type flows out to your HTTP consumers.
 * There is no hand-written JSON parsing anywhere in this codebase, and no
 * "please respond only with JSON" pleading in a prompt.
 *
 * `.describe()` is not decoration — the text is compiled into the JSON Schema
 * sent to the model and is the primary way you steer a field's semantics.
 */
import { z } from "zod";

export const CategoryEnum = z.enum([
  "billing",
  "shipping",
  "product_defect",
  "returns",
  "account",
  "safety",
  "other",
]);
export type Category = z.infer<typeof CategoryEnum>;

export const UrgencyEnum = z.enum(["low", "normal", "high", "urgent"]);
export type Urgency = z.infer<typeof UrgencyEnum>;

export const TriageSchema = z.object({
  category: CategoryEnum.describe(
    "The single best-fitting category, using the definitions in section 8 of the policy handbook.",
  ),
  urgency: UrgencyEnum.describe(
    "Urgency per the definitions in section 8. Safety reports are always 'urgent'.",
  ),
  sentiment: z
    .enum(["angry", "frustrated", "neutral", "positive"])
    .describe("The customer's emotional register, not the severity of the issue."),
  summary: z
    .string()
    .describe(
      "One sentence, under 25 words, stating what the customer wants. Written for an agent skimming a queue.",
    ),
  entities: z
    .object({
      order_ids: z
        .array(z.string())
        .describe("Order identifiers mentioned, verbatim (e.g. 'NW-48211'). Empty array if none."),
      product_names: z
        .array(z.string())
        .describe("Product names mentioned. Empty array if none."),
      requested_remedy: z
        .enum(["refund", "replacement", "information", "cancellation", "escalation", "none"])
        .describe("What the customer explicitly asked for, not what you think they should get."),
    })
    .describe("Structured facts lifted from the message with no inference."),
  requires_human: z
    .boolean()
    .describe(
      "True if policy section 5.3 mandates supervisor escalation, or if a confident automated reply is not possible.",
    ),
  escalation_reason: z
    .string()
    .nullable()
    .describe("Why a human is required, or null when requires_human is false."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Your calibrated confidence in this classification. Use the full range — a genuinely ambiguous ticket should score near 0.5, not 0.9.",
    ),
});
export type TriageResult = z.infer<typeof TriageSchema>;

/** The resolution plan produced by the tool-using agent in /v1/resolve. */
export const ResolutionSchema = z.object({
  recommended_action: z
    .enum([
      "issue_refund",
      "ship_replacement",
      "provide_information",
      "decline_with_goodwill",
      "escalate_to_supervisor",
    ])
    .describe("The single action the agent should take."),
  policy_citations: z
    .array(z.string())
    .describe(
      "Specific handbook clause numbers that justify the action, e.g. ['2.2', '5.3']. Never cite a clause you did not read via the search_policy tool.",
    ),
  refund_amount_usd: z
    .number()
    .nullable()
    .describe("Dollar amount when recommending a refund, otherwise null."),
  within_agent_authority: z
    .boolean()
    .describe("False if the action exceeds the $200 agent refund authority in clause 2.7."),
  reasoning: z
    .string()
    .describe("Two or three sentences an agent can read before acting. Reference the facts you looked up."),
});
export type Resolution = z.infer<typeof ResolutionSchema>;

/** Request body shared by every route that takes a ticket. */
export const TicketInput = z.object({
  message: z.string().min(1, "message is required").max(20_000),
  customer_email: z.string().email().optional(),
  channel: z.enum(["email", "chat", "phone_transcript"]).default("email"),
});
export type Ticket = z.infer<typeof TicketInput>;
