/**
 * The pure half of the admin console and the activity log: who counts as an
 * admin, what an error is recorded as, and what a Tutor review is reduced to
 * before it is stored. No `server-only`, so `node:test` can load it.
 *
 * Each function here is a decision about what the database is allowed to
 * hold, which is why they sit together and are tested rather than inlined.
 */

/**
 * GitHub numeric ids, never logins. A login can be renamed and then registered
 * by someone else; the id cannot. Anything that is not a plain positive
 * integer is ignored rather than guessed at, so a typo grants nobody.
 */
export function parseAdminIds(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[1-9]\d{0,15}$/.test(s))
      .map((s) => `gh:${s}`),
  );
}

/**
 * What a failed call is recorded as. A short code, never the message: an
 * upstream error can quote the request, and the request can quote the learner.
 */
export function errorCode(error: unknown): string {
  if (typeof error === "string") return error.slice(0, 40);
  if (!error || typeof error !== "object") return "error";
  const e = error as { name?: unknown; status?: unknown };
  if (e.name === "AbortError") return "aborted";
  if (typeof e.status === "number") return `http_${e.status}`;
  if (e.name === "TutorError") return "invalid_output";
  return "error";
}

export interface ReviewInput {
  verdict: "pass" | "revise";
  rubric: { met: boolean; gap: "missing" | "incorrect" | null }[];
}

export interface ReviewRecord {
  labIds: string[];
  verdict: "pass" | "revise";
  criteria: number;
  met: number;
  missing: number;
  incorrect: number;
  /** Planted starter mistakes and whether the criterion each one sits on was met. */
  mistakes: { id: string; fixed: boolean }[];
}

/**
 * A review, reduced to outcomes. Criterion text, notes, fixes and the attempt
 * itself are dropped here, before anything reaches the database: the admin
 * view needs to know that learners miss part 2 of Lab 7, not what they wrote.
 *
 * Lab ids are only kept if the Tutor knows them, so the page cannot use this
 * to write arbitrary strings into the collection.
 */
export function reviewRecord(
  review: ReviewInput,
  input: { labIds: readonly string[]; defects: readonly { mistakeId: string; criterion: number }[] },
  known: { labs: ReadonlySet<string>; mistakeLab: (id: string) => string | undefined },
): ReviewRecord {
  const mistakes = input.defects
    .filter((d) => known.mistakeLab(d.mistakeId) !== undefined)
    .map((d) => ({ id: d.mistakeId, fixed: review.rubric[d.criterion]?.met ?? false }));
  const labIds = [
    ...new Set([
      ...input.labIds.filter((id) => known.labs.has(id)),
      ...mistakes.map((m) => known.mistakeLab(m.id)!),
    ]),
  ].sort();
  return {
    labIds,
    verdict: review.verdict,
    criteria: review.rubric.length,
    met: review.rubric.filter((c) => c.met).length,
    missing: review.rubric.filter((c) => !c.met && c.gap === "missing").length,
    incorrect: review.rubric.filter((c) => !c.met && c.gap === "incorrect").length,
    mistakes,
  };
}
