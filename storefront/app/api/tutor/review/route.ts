import { z } from "zod";
import { reviewAttempt } from "@/lib/tutor";
import { tutorOptions, tutorPost } from "@/lib/tutorRoute";
import { TUTOR_LIMITS } from "@/lib/tutorPolicy";

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
    title: text(160),
    exercise: z.object({
      prompt: text(4_000),
      deliverable: text(400),
      rubric: z.array(text(300)).min(1).max(8),
    }),
  }),
  attempt: text(TUTOR_LIMITS.maxAttemptChars),
});

export const OPTIONS = tutorOptions;

export async function POST(request: Request) {
  return tutorPost(request, Body, reviewAttempt);
}
