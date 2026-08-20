/**
 * Model routing — the "routing" workflow pattern, applied to model choice.
 *
 * TEACHING NOTE: this is the smallest useful agentic pattern and the one most
 * teams skip. The observation behind it: your traffic is not uniform. Most
 * inbound support messages are three lines about a late package, and a few are
 * a parent describing an allergic reaction. Paying flagship rates for the first
 * kind to be safe on the second kind means paying flagship rates on everything.
 *
 * Two mechanisms, and the difference between them matters:
 *
 *   pickModel()  routes BEFORE the call, on cheap signals (length, keywords).
 *                Zero extra cost, but it can only see the input.
 *   escalate     routes AFTER a cheap call, on the model's own confidence.
 *                Costs a second call when it fires, but it sees the answer.
 *
 * Lab 7 measures both. The honest result is that the second one is better and
 * the first one is nearly free, so real systems tend to run them together.
 *
 * A WARNING that Lab 8 makes concrete: `pickModel` reads untrusted customer
 * text. Its keyword list is therefore an attack surface — a message can be
 * written to route itself DOWN to the cheap tier by avoiding safety language,
 * which is exactly what a casually-worded injury report does by accident. That
 * is why the bias here is toward escalation and why `requires_human` is never
 * decided by this function.
 */
import { MODEL_TIERS } from "../config.js";

export interface RoutingDecision {
  model: string;
  /** Human-readable, and returned in `meta.routed` so the choice is auditable. */
  reason: string;
}

/**
 * Language that correlates with a case where being wrong is expensive.
 *
 * These are deliberately over-broad. A false positive costs the difference
 * between a Haiku call and an Opus call — a fraction of a cent. A false
 * negative costs a mis-routed injury report. The asymmetry is not close, so
 * the list errs toward matching.
 */
const HIGH_STAKES = [
  // Safety and injury — handbook clause 5.4.
  "injur", "hurt", "burn", "rash", "allerg", "swallow", "choke", "sick",
  "hospital", "doctor", "emergency", "child", "kid", "baby", "toddler",
  // Legal and regulatory — clause 5.3.
  "lawyer", "attorney", "legal", "lawsuit", "sue", "court", "regulator",
  "attorney general", "discriminat", "harass",
  // Money at a scale that exceeds agent authority — clause 2.7.
  "chargeback", "fraud", "unauthorized",
];

/** Below this, a message is almost never a multi-fact case worth a big model. */
const SHORT_MESSAGE_CHARS = 240;

/**
 * Chooses a model for a ticket, cheapest tier that is defensible.
 *
 * Order matters: the safety check runs FIRST and unconditionally. A short
 * message that mentions a child is still a short message, and it still goes to
 * the flagship model.
 */
export function pickModel(message: string): RoutingDecision {
  const haystack = message.toLowerCase();

  const hit = HIGH_STAKES.find((term) => haystack.includes(term));
  if (hit) {
    return {
      model: MODEL_TIERS.flagship,
      reason: `high-stakes language ("${hit}") — cost of a wrong answer exceeds the model price difference`,
    };
  }

  if (message.length <= SHORT_MESSAGE_CHARS) {
    return {
      model: MODEL_TIERS.fast,
      reason: `short message (${message.length} chars), no high-stakes language`,
    };
  }

  return {
    model: MODEL_TIERS.balanced,
    reason: `long message (${message.length} chars) — more facts to extract, no high-stakes language`,
  };
}

/**
 * Below this confidence, a cheap-tier answer gets a second opinion.
 *
 * 0.7 rather than 0.6, and the reason is measured rather than chosen: on this
 * repo's gold set the ambiguous case scores ~0.46 and the business-day case —
 * the one that is confidently wrong — scores ~0.71. A 0.6 threshold catches
 * only the first. 0.7 catches neither reliably, which is the point Lab 7 Q4
 * makes: escalation buys you coverage of the UNSURE cases, and buys you
 * nothing at all against the confidently wrong ones. For those you need a
 * deterministic check, which is Lab 8.
 */
export const ESCALATE_BELOW = 0.7;
