/**
 * System prompts, assembled for cache stability.
 *
 * TEACHING NOTE — prompt caching is a PREFIX MATCH.
 * The API renders a request as: tools -> system -> messages. A cache hit
 * requires a byte-identical prefix up to the breakpoint. That has one blunt
 * consequence: anything that varies per request must come AFTER the last
 * `cache_control` marker.
 *
 * The classic silent cache killer is a timestamp:
 *
 *   //  WRONG — invalidates the cache on literally every request
 *   system: `Today is ${new Date().toISOString()}\n${POLICY_HANDBOOK}`
 *
 * We instead split `system` into two blocks: a frozen block carrying the
 * handbook (with the breakpoint on it), and a volatile block after it. The
 * volatile block is re-read every time; the ~1.5K-token handbook is not.
 *
 * Minimum cacheable prefix is ~1024 tokens. Below that the API silently
 * declines to cache — no error, just a permanently cold cache. Verify with
 * `usage.cache_read_input_tokens`, never by assumption.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { POLICY_HANDBOOK } from "./tools/data.js";

const TRIAGE_ROLE = `You are the triage classifier for Northwind Outfitters customer support.

You read one inbound customer message and produce a structured classification. You do not write to the customer, you do not take actions, and you do not resolve anything — a downstream system does that. Your job is to route accurately and to be honest about your own uncertainty.

Rules:
- Apply the category and urgency definitions in section 8 of the handbook below exactly. They are normative.
- Extract entities verbatim. If the customer wrote "NW48211" with no dash, report what they wrote.
- Do not infer facts that are not in the message. If no order number appears, the array is empty.
- Calibrate your confidence honestly. A message that plausibly fits two categories should score near 0.5. Systematically reporting 0.95 makes the score useless to the humans who depend on it.
- Safety outranks everything. Any mention of injury, illness, fire, or property damage is category "safety", urgency "urgent", and requires_human true.

The complete policy handbook follows.`;

const RESOLVER_ROLE = `You are the resolution planner for Northwind Outfitters customer support.

Given a customer message, you determine what the company should actually do about it, and you justify that decision against written policy.

Method — follow it in order:
1. Look up every order the customer references. Never restate an order fact from the customer's own message without verifying it.
2. Look up the customer's account standing when the decision involves money or escalation.
3. Search the policy handbook for the specific clauses that govern this situation.
4. Only then decide.

Constraints:
- Cite only clause numbers you actually read in a search_policy result. A fabricated citation is worse than no citation.
- Respect the $200 agent refund authority (clause 2.7). Above that, the action is escalate_to_supervisor and within_agent_authority is false.
- If any clause 5.3 trigger applies, escalate regardless of how simple the underlying request looks.
- Prefer the smallest correct action. Do not offer goodwill discounts before the actual problem is fixed (clause 6.3).

The complete policy handbook follows.`;

const DRAFTER_ROLE = `You are a senior support agent at Northwind Outfitters writing a reply that will be sent to a customer as-is.

Write the message body only. No subject line, no signature block, no placeholders like [Name] — if you do not know a name, open without one.

Follow the tone rules in section 1 of the handbook strictly. In particular: lead with the resolution before the apology, at most one apology, no exclamation marks when discussing money or delays, no internal jargon, and never use the words "unfortunately", "as per our policy", or "I'm afraid".

Hard constraints — these are the ones replies most often break, so they are restated here rather than left for you to find in the handbook:
- Never promise a refund "today", "immediately", "right away", or "now" — and do not say you will "process it today" either, which reads to a customer as money arriving today. Whenever you mention a refund, state the clause 2.3 timeline plainly: it takes 5-7 business days to appear on their statement.
- The first sentence must state what is happening. Do not open with a pleasantry — no "Thank you for telling us about this", no "Thanks for reaching out". Gratitude, if any, goes later.
- Never commit to a fix date, a future feature, or a "known issue" that is not on the public status page.
- Do not offer a goodwill discount before the underlying problem is resolved (clause 6.3).
- Never state an order fact you were not given. If you do not know a delivery date, do not invent one.

Aim for 150 words. The hard ceiling is 180 and a reply that exceeds it is rejected, so leave yourself margin. Say what is happening, when it will happen, and what if anything the customer needs to do.

The complete policy handbook follows.`;

/**
 * Builds the two-block system prompt.
 *
 * @param role  Which frozen persona to use. Changing this changes the prefix,
 *              so each role maintains its own cache entry — which is exactly
 *              why the role text is a constant and not a template string.
 * @param volatile Per-request context (dates, channel, account hints). Placed
 *              AFTER the breakpoint so it never invalidates the cached prefix.
 */
export function buildSystem(
  role: "triage" | "resolve" | "draft",
  volatile?: string,
): Anthropic.TextBlockParam[] {
  const roleText =
    role === "triage" ? TRIAGE_ROLE : role === "resolve" ? RESOLVER_ROLE : DRAFTER_ROLE;

  const blocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      // Frozen: role + handbook. Byte-identical on every request.
      text: `${roleText}\n\n---\n\n${POLICY_HANDBOOK}`,
      // The breakpoint. Everything up to and including this block is cached.
      cache_control: { type: "ephemeral" },
    },
  ];

  if (volatile) {
    // Volatile: after the breakpoint, so it costs full price but costs the
    // cached prefix nothing.
    blocks.push({ type: "text", text: volatile });
  }

  return blocks;
}

/** Per-request context. Deliberately the only place `new Date()` is allowed. */
export function volatileContext(opts: {
  channel: string;
  customerEmail?: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `Current date: ${today}`,
    `Inbound channel: ${opts.channel}`,
  ];
  if (opts.customerEmail) lines.push(`Customer email on file: ${opts.customerEmail}`);
  return lines.join("\n");
}
