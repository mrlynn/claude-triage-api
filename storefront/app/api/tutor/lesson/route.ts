import { z } from "zod";
import { prepareLesson } from "@/lib/tutor";
import { tutorOptions, tutorPost } from "@/lib/tutorRoute";
import { TUTOR_LIMITS } from "@/lib/tutorPolicy";

/**
 * Prepares one session. The page sends back the session from its own copy of
 * the plan — nothing is stored here — so every field is bounded: this body is
 * interpolated into a prompt, and an unbounded one is an unbounded bill.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const text = (max: number) => z.string().trim().min(1).max(max);

const Body = z.object({
  session: z.object({
    n: z.number().int().min(1).max(TUTOR_LIMITS.maxSessions),
    title: text(160),
    minutes: z.number().int().min(TUTOR_LIMITS.minMinutes).max(TUTOR_LIMITS.maxMinutes),
    day: z.number().int().min(1).max(TUTOR_LIMITS.maxDays),
    labIds: z.array(text(40)).min(1).max(4),
    objectives: z.array(text(240)).max(6),
    whyNow: z.string().max(400),
  }),
  level: z.enum(["new", "some", "shipped"]),
  weakSpots: z.array(z.string().max(40)).max(10).default([]),
});

export const OPTIONS = tutorOptions;

export async function POST(request: Request) {
  return tutorPost(request, Body, prepareLesson);
}
