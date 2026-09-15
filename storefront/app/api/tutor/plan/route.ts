import { z } from "zod";
import { CORPUS_INDEX, buildPlan } from "@/lib/tutor";
import { tutorOptions, tutorPost } from "@/lib/tutorRoute";
import { TUTOR_LIMITS } from "@/lib/tutorPolicy";

/**
 * Builds a cram plan from the learner's confirmed scope. Outline only — the
 * first lesson is a separate call the page makes as soon as this returns.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  days: z.number().int().min(1).max(TUTOR_LIMITS.maxDays),
  sessionsPerDay: z.number().int().min(1).max(TUTOR_LIMITS.maxSessionsPerDay),
  minutesPerSession: z.number().int().min(TUTOR_LIMITS.minMinutes).max(TUTOR_LIMITS.maxMinutes),
  level: z.enum(["new", "some", "shipped"]),
  focus: z.array(z.string().max(40)).max(20).default([]),
});

export const OPTIONS = tutorOptions;

export async function POST(request: Request) {
  return tutorPost(request, Body, async (intake) => ({ ...(await buildPlan(intake)), docs: CORPUS_INDEX }));
}
