/**
 * Citation verification — checking that quoted clauses were actually read.
 *
 * TEACHING NOTE: the `search_policy` tool description already says
 *
 *     "Cite only clause numbers that appear in text this tool returned to you."
 *
 * and `ResolutionSchema.policy_citations` repeats it. Both are instructions.
 * Neither is a check. Until this file, a resolution could cite clause 9.9 —
 * which does not exist in the handbook — and the service would return it with
 * the same confidence as a real one.
 *
 * That matters more here than in most domains. A policy citation is the thing
 * a human agent uses to decide whether to trust the recommendation, and an
 * invented one is *more* persuasive than no citation at all. A hallucinated
 * source does not read as uncertainty; it reads as diligence.
 *
 * A CORRECTION WORTH READING, because the first version of this file got it
 * wrong in an instructive way.
 *
 * The obvious check is "did this clause appear in a `search_policy` result?",
 * and the tool description invites exactly that reading. It produces false
 * positives on every run, because **the entire handbook is already in the
 * cached system prompt** (see `prompts.ts`). The model does not need the tool
 * to know what clause 2.7 says — it can read it directly — so a resolution
 * citing 2.7 without a matching tool call is completely legitimate.
 *
 * The first version of this checker flagged 2.7, 5.1, 5.4 and 5.5 as
 * fabricated. All four are real. The verifier was wrong about the
 * architecture, and it took a red-team run to notice.
 *
 * So the real check is EXISTENCE: does the cited clause exist in the handbook
 * at all? That catches the forged "clause 9.9" and permits every genuine
 * citation regardless of how the model came to know it. Whether the agent
 * searched before citing is still worth reporting — it is a diligence signal —
 * but it is not a violation, and conflating the two produces a checker that
 * cries wolf until someone turns it off.
 */
import type { ToolCallRecord } from "../tools/index.js";
import { POLICY_HANDBOOK } from "../tools/data.js";

export interface CitationReport {
  /** Clause numbers the resolution claims to rely on. */
  cited: string[];
  /** Cited clauses that do not exist in the handbook. Fabricated sources. */
  unsupported: string[];
  /**
   * Real clauses cited without a matching `search_policy` result. NOT a
   * violation — the handbook is in the system prompt — but a diligence signal
   * worth surfacing when an agent is confidently citing things it never
   * looked up.
   */
  cited_without_search: string[];
  /** Whether the agent ran any policy search at all. */
  searched: boolean;
}

/** Clause references look like 2.7, 5.3, 8.11 — a digit, a dot, digits. */
const CLAUSE_PATTERN = /\b\d{1,2}\.\d{1,2}\b/g;

/** Every clause number that exists in the handbook. Computed once at import. */
const REAL_CLAUSES: ReadonlySet<string> = new Set(
  [...POLICY_HANDBOOK.matchAll(CLAUSE_PATTERN)].map((m) => m[0]),
);

/** Every clause number that appeared in text the tools actually returned. */
function clausesSeenInTrace(trace: ToolCallRecord[]): Set<string> {
  const seen = new Set<string>();
  for (const call of trace) {
    if (call.tool !== "search_policy") continue;
    const text = typeof call.output === "string" ? call.output : JSON.stringify(call.output);
    for (const match of text.matchAll(CLAUSE_PATTERN)) seen.add(match[0]);
  }
  return seen;
}

/**
 * Checks that every cited clause is real.
 *
 * WHAT THIS DOES NOT CATCH, and the distinction matters because "we verify
 * citations" invites people to assume the stronger property: a clause that
 * exists but does not actually support the conclusion drawn from it. That is a
 * reading-comprehension failure, and no string comparison finds it — it needs
 * a judge, or a human. What this catches is the cheaper and more dangerous
 * failure, a citation to a source that does not exist, which cannot be
 * defended under any interpretation and which reads as diligence rather than
 * as uncertainty.
 */
export function verifyCitations(
  citations: string[],
  trace: ToolCallRecord[],
): CitationReport {
  const seen = clausesSeenInTrace(trace);
  const searched = trace.some((c) => c.tool === "search_policy");

  // Normalize: the model may cite "clause 2.7" or "§2.7" rather than a bare id.
  const cited = citations
    .flatMap((c) => [...String(c).matchAll(CLAUSE_PATTERN)].map((m) => m[0]))
    .filter((c, i, arr) => arr.indexOf(c) === i);

  return {
    cited,
    unsupported: cited.filter((c) => !REAL_CLAUSES.has(c)),
    cited_without_search: cited.filter((c) => REAL_CLAUSES.has(c) && !seen.has(c)),
    searched,
  };
}
