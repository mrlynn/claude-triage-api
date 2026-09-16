import { z } from "zod";
import { logReview } from "@/lib/activity";
import { reviewRecord } from "@/lib/adminPolicy";
import { KNOWN_IDS, mistakeLab, reviewAttempt } from "@/lib/tutor";
import { tutorOptions, tutorPost } from "@/lib/tutorRoute";
import { TUTOR_FIELDS, TUTOR_LIMITS } from "@/lib/tutorPolicy";

/**
 * "Review my attempt." The exercise comes back from the page with the attempt,
 * bounded like everything else that reaches a prompt. The attempt itself is
 * wrapped as untrusted inside `reviewAttempt`.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const text = (max: number) => z.string().trim().min(1).max(max);

const Body = z.object({
  lesson: z.object({
    title: text(TUTOR_FIELDS.title),
    exercise: z.object({
      prompt: text(TUTOR_FIELDS.prompt),
      deliverable: text(TUTOR_FIELDS.deliverable),
      rubric: z.array(text(TUTOR_FIELDS.rubricItem)).min(1).max(TUTOR_FIELDS.rubric),
    }),
  }),
  // Ids only: the server looks up what each one means, so the page cannot
  // supply a mistake, only name one. Lessons saved before starters send none.
  defects: z
    .array(
      z.object({
        mistakeId: text(TUTOR_FIELDS.mistakeId),
        criterion: z.number().int().min(0).max(TUTOR_FIELDS.rubric - 1),
      }),
    )
    .max(TUTOR_LIMITS.maxDefects)
    .default([]),
  attempt: text(TUTOR_LIMITS.maxAttemptChars),
  // The labs the lesson teaches, for the admin console's per-lab pass rates.
  // Ids only, filtered against the corpus before storage. Optional: pages
  // cached from before this field existed still get a review.
  labIds: z.array(text(TUTOR_FIELDS.mistakeId)).max(8).default([]),
});

export const OPTIONS = tutorOptions;

export async function POST(request: Request) {
  return tutorPost(request, Body, "tutor_review", reviewAttempt, (input, { review }, userId) => {
    // Outcomes only. The attempt, the notes and the criterion text stay out of the database.
    logReview(userId, reviewRecord(review, input, { labs: KNOWN_IDS, mistakeLab }));
  });
}
