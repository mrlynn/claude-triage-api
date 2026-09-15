import { z } from "zod";
import { reviewAttempt } from "@/lib/tutor";
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
  attempt: text(TUTOR_LIMITS.maxAttemptChars),
});

export const OPTIONS = tutorOptions;

export async function POST(request: Request) {
  return tutorPost(request, Body, reviewAttempt);
}
