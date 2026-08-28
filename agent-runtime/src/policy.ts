/**
 * Northwind's simulated support authority, in one module because three
 * different moments need the same answer and must not drift apart.
 *
 * TEACHING NOTE — this is the file that makes Lab 10 more than a chat box.
 * The model is told the limit in the prompt, and the prompt is advice. What
 * actually holds is that:
 *
 *   1. `propose_support_action` re-derives the limit and DOWNGRADES an
 *      over-authority request to an escalation. A $900 refund does not fail
 *      a schema check and hope the model recovers gracefully — it
 *      deterministically becomes an escalation, which is the correct outcome
 *      whatever the model intended.
 *   2. The confirmation endpoint re-derives it AGAIN, minutes later, on a
 *      separate request. A stored proposal is not evidence that it was ever
 *      within policy; re-checking is what makes confirmation meaningful when
 *      the model was mistaken or the record was tampered with.
 *
 * Authority is application code. If the only thing standing between a
 * customer and $900 is a sentence in a system prompt, there is nothing there.
 */
export const SUPPORT_POLICY = {
  refund_authority_usd: 200,
  confirmation_required: true,
  escalate_when: ["safety", "missing facts", "over authority"],
} as const;

export type SupportAction = {
  action: "refund" | "replacement" | "escalation";
  amountUsd?: number;
  rationale: string;
};

/**
 * Whether an action is inside Northwind's authority.
 *
 * An escalation is always allowed — escalating is the act of NOT exercising
 * authority. Anything else has to carry a finite, non-negative amount at or
 * under the ceiling; a missing amount reads as zero, and a NaN reads as out
 * of policy rather than sneaking through a comparison that is false either way.
 */
export function withinAuthority(action: Pick<SupportAction, "action" | "amountUsd">): boolean {
  if (action.action === "escalation") return true;
  const amount = action.amountUsd ?? 0;
  return Number.isFinite(amount) && amount >= 0 && amount <= SUPPORT_POLICY.refund_authority_usd;
}

/**
 * The action as policy allows it, which is not always the action requested.
 *
 * Returning a rewritten action rather than throwing keeps the conversation
 * going: the customer gets a real next step ("this is going to a human")
 * instead of a tool error the model has to improvise around.
 */
export function underAuthority(action: SupportAction): SupportAction {
  if (withinAuthority(action)) return action;
  return {
    action: "escalation",
    rationale:
      `Requested ${action.action} of $${action.amountUsd ?? 0} exceeds the ` +
      `$${SUPPORT_POLICY.refund_authority_usd} authority, so it is escalated for human review. ` +
      action.rationale,
  };
}
