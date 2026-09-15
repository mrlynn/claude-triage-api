import { z } from "zod";
import { hintForAttempt } from "@/lib/tutor";
import { tutorOptions, tutorPost } from "@/lib/tutorRoute";
import { TUTOR_FIELDS, TUTOR_LIMITS, nextHintLevel } from "@/lib/tutorPolicy";

/**
 * "I'm stuck." Same bounds as the review, except the draft may be empty — the
 * learner most likely to leave is the one who has not written a line. The
 * level comes from how many hints the page says it already has, so asking
 * again escalates and a fourth request is refused rather than generated.
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
  attempt: z.string().trim().max(TUTOR_LIMITS.maxAttemptChars),
  question: z.string().trim().max(TUTOR_LIMITS.maxQuestionChars),
  previous: z.array(text(TUTOR_FIELDS.hint)).max(TUTOR_LIMITS.maxHints - 1),
});

export const OPTIONS = tutorOptions;

export async function POST(request: Request) {
  return tutorPost(request, Body, (input) => {
    // `.max()` above makes this non-null; the check keeps the type honest.
    const level = nextHintLevel(input.previous.length);
    if (!level) throw new Error("hint limit reached");
    return hintForAttempt({ ...input, level });
  });
}
