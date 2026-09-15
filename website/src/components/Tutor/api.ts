import { storefrontApi } from "@site/src/urls";
import { reportAi } from "@site/src/components/Account/accountClient";
import type { CallMeta, DocRef, Hint, Intake, Lesson, Level, Plan, PlanSession, Review } from "./types";

/**
 * The four Tutor calls. The storefront holds the key and stores nothing; this
 * page holds the plan and sends back only the part each call needs.
 *
 * Credentials are sent because the storefront decides who pays for each call —
 * free credit for a signed-in learner, or their own key — from the session
 * cookie. Every response carries the updated meter, and a refusal for credit
 * or sign-in opens it.
 */

export class TutorApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${storefrontApi()}/api/tutor/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TutorApiError("Could not reach the Tutor. Check your connection and try again.", 0);
  }
  const data = (await response.json().catch(() => null)) as ({ detail?: string } & T) | null;
  reportAi(data);
  if (!response.ok || !data) {
    throw new TutorApiError(data?.detail ?? "The Tutor could not complete that request.", response.status);
  }
  return data;
}

export const tutorApi = {
  plan: (intake: Intake) => post<{ plan: Plan; meta: CallMeta; docs: DocRef[] }>("plan", intake),
  lesson: (session: PlanSession, level: Level, weakSpots: string[]) =>
    post<{ lesson: Lesson; meta: CallMeta }>("lesson", { session, level, weakSpots }),
  review: (lesson: Lesson, attempt: string) =>
    post<{ review: Review; meta: CallMeta }>("review", {
      lesson: { title: lesson.title, exercise: lesson.exercise },
      attempt,
      defects: lesson.starter?.defects ?? [],
    }),
  hint: (lesson: Lesson, attempt: string, question: string, previous: Hint[]) =>
    post<{ hint: Hint; meta: CallMeta }>("hint", {
      lesson: { title: lesson.title, exercise: lesson.exercise },
      attempt,
      question,
      previous: previous.map((h) => h.text),
      defects: lesson.starter?.defects ?? [],
    }),
};
