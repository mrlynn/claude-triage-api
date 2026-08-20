/**
 * Deterministic authority checks.
 *
 * TEACHING NOTE — the single most important idea in Lab 8:
 *
 *     A model-judged boolean is a HYPOTHESIS. A control is CODE.
 *
 * `ResolutionSchema` has a field called `within_agent_authority`, described as
 * "False if the action exceeds the $200 agent refund authority in clause 2.7."
 * Until this file existed, nothing checked it. The model decided whether the
 * model was allowed to do the thing, reported the answer in a boolean, and the
 * service passed that boolean through to the caller as if it were a fact.
 *
 * That is not a prompt-injection problem specifically. It fails the same way
 * under ordinary arithmetic error, a misread clause, or a customer who is
 * simply very persuasive. Injection just makes it reproducible on demand.
 *
 * The fix is not a better prompt. Refund limits are arithmetic, the amounts
 * are in the tool trace, and code does not have opinions about clause 2.7. So:
 * recompute the decision from the recorded facts, and where the recomputation
 * disagrees with the model, the recomputation wins and the disagreement is
 * reported rather than smoothed over.
 *
 * WHY REPORT THE DISAGREEMENT: `model_claimed_authority_it_lacked` is the most
 * valuable signal this repo emits. A silent correction fixes one response; a
 * counted one tells you your prompt is drifting, or that someone has found an
 * input that works. Correct AND alarm.
 */
import type { Resolution } from "../schemas.js";
import type { ToolCallRecord } from "../tools/index.js";

/** Clause 2.7 — an agent may refund up to this without a supervisor. */
export const AGENT_REFUND_LIMIT_USD = 200;

/** Clause 5.3 — cumulative refunds above this in 30 days escalate. */
export const THIRTY_DAY_REFUND_CEILING_USD = 500;

export interface AuthorityVerdict {
  allowed: boolean;
  /** Machine-readable codes, so an eval can assert on them. */
  violations: string[];
  /** The resolution as it should actually be returned. */
  corrected: Resolution;
}

const REFUND_ACTIONS = new Set(["issue_refund"]);

/**
 * Pulls prior 30-day refund spend out of the tool trace.
 *
 * Reads the RECORDED tool output rather than the model's prose summary of it,
 * which is the whole point: the trace is what the back office actually said,
 * and the reasoning field is what the model says the back office said.
 */
function priorRefunds30d(trace: ToolCallRecord[]): number | null {
  for (const call of trace) {
    if (call.tool !== "lookup_customer") continue;
    const out = call.output as { found?: boolean; refunds_last_30d_usd?: unknown } | null;
    if (out && out.found !== false && typeof out.refunds_last_30d_usd === "number") {
      return out.refunds_last_30d_usd;
    }
  }
  return null;
}

/**
 * Re-derives whether the recommended action is actually permitted.
 *
 * @param resolution What the model produced.
 * @param trace      Every tool call it made, in order.
 */
export function enforceAuthority(
  resolution: Resolution,
  trace: ToolCallRecord[],
): AuthorityVerdict {
  const violations: string[] = [];
  const amount = resolution.refund_amount_usd ?? 0;
  const isRefund = REFUND_ACTIONS.has(resolution.recommended_action);

  // Clause 2.7 — the single-refund ceiling.
  if (isRefund && amount > AGENT_REFUND_LIMIT_USD) {
    violations.push("refund_exceeds_agent_authority");
  }

  // Clause 5.3 — the rolling 30-day ceiling. Only checkable when the agent
  // actually looked the customer up; if it did not, that is its own finding.
  const prior = priorRefunds30d(trace);
  if (isRefund && prior === null) {
    violations.push("refund_without_customer_lookup");
  } else if (isRefund && prior !== null && prior + amount > THIRTY_DAY_REFUND_CEILING_USD) {
    violations.push("refund_exceeds_30d_ceiling");
  }

  // A refund with no amount is not a small formatting problem — it is an
  // unbounded instruction to a downstream system.
  if (isRefund && resolution.refund_amount_usd === null) {
    violations.push("refund_without_amount");
  }

  const allowed = violations.length === 0;

  // THE MONEY MOMENT. The model asserted it was within authority and the
  // arithmetic says otherwise. Distinct from the violations above, because
  // those describe the ACTION and this one describes the model's SELF-REPORT.
  // A system whose self-reports are unreliable needs different fixes from one
  // whose actions are.
  if (!allowed && resolution.within_agent_authority) {
    violations.push("model_claimed_authority_it_lacked");
  }

  const corrected: Resolution = allowed
    ? resolution
    : {
        ...resolution,
        recommended_action: "escalate_to_supervisor",
        within_agent_authority: false,
        reasoning:
          `[Automatically escalated: ${violations.join(", ")}.] ` + resolution.reasoning,
      };

  return { allowed, violations, corrected };
}
