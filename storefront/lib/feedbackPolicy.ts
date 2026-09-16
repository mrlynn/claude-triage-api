import { z } from "zod";

/**
 * What a piece of feedback may contain, decided before anything is stored.
 * No `server-only`, so `node:test` can load it. Decision 13 in
 * docs/architecture.md.
 *
 * Feedback is the one place the admin console stores text a person typed, so
 * the rules are narrow: a short comment, scrubbed of emails, phone numbers and
 * API keys on the way in, attached to ids the server can check rather than to
 * anything the page describes. The assistant reply or Tutor output being rated
 * is NOT sent — only which surface it was, and which labs.
 */

export const FEEDBACK_SURFACES = ["page", "tutor_lesson", "tutor_hint", "tutor_review", "assistant", "general"] as const;
export type FeedbackSurface = (typeof FEEDBACK_SURFACES)[number];

/** Pick-a-reason chips. A fixed list, so the common complaints count without reading every comment. */
export const FEEDBACK_REASONS = ["confusing", "incorrect", "broken", "too_long", "too_short", "missing_something"] as const;

/** For the general form, which has no page to rate. */
export const FEEDBACK_CATEGORIES = ["bug", "idea", "content", "praise", "other"] as const;

export const MAX_COMMENT_CHARS = 1_000;
/** How long after the rating a comment may still be attached to it. */
export const AMEND_WINDOW_MS = 60 * 60 * 1000;

const id = z.string().regex(/^[a-z0-9-]{1,60}$/);

export const FeedbackBody = z
  .object({
    /** Set to amend a rating already sent (add a comment or reasons), from the id the first POST returned. */
    id: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
    surface: z.enum(FEEDBACK_SURFACES),
    rating: z.enum(["up", "down"]).nullable().default(null),
    reasons: z.array(z.enum(FEEDBACK_REASONS)).max(FEEDBACK_REASONS.length).default([]),
    category: z.enum(FEEDBACK_CATEGORIES).nullable().default(null),
    comment: z.string().max(MAX_COMMENT_CHARS).nullable().default(null),
    /** The page it was left on. A path, never a full URL: no query string, so nothing a URL carries rides along. */
    path: z
      .string()
      .max(200)
      .regex(/^\/[A-Za-z0-9/_.-]*$/)
      .nullable()
      .default(null),
    site: z.enum(["course", "storefront"]).default("course"),
    labIds: z.array(id).max(8).default([]),
  })
  .refine((b) => b.id !== undefined || b.rating !== null || (b.comment?.trim().length ?? 0) > 0, {
    message: "A rating or a comment is required.",
  });

export type FeedbackInput = z.infer<typeof FeedbackBody>;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone-shaped: grouped with separators, or led by +. A bare run of digits is
// left alone, because feedback on a cost lab quotes token counts like 1500000.
const PHONE = /(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\+\d[\d\s.-]{8,}\d/g;
const API_KEY = /sk-ant-[A-Za-z0-9_-]+/g;

/**
 * Removes what a comment should never carry into the database. Card numbers
 * and SSNs are handled by `redactPII` in the route, which already exists and
 * is server-only; this covers the identifiers feedback in particular invites
 * ("email me at…") and the credential a learner on this site is most likely
 * to paste by accident.
 */
export function scrubComment(raw: string | null): string | null {
  if (raw === null) return null;
  const text = raw
    .replace(API_KEY, "[api key removed]")
    .replace(EMAIL, "[email removed]")
    .replace(PHONE, "[number removed]")
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * The labs feedback is about: whatever the page named, if the Tutor knows the
 * id, plus the lab a course path belongs to. The page never gets to invent one.
 */
export function feedbackLabs(
  input: Pick<FeedbackInput, "labIds" | "path">,
  corpus: readonly { id: string; path: string }[],
): string[] {
  const known = new Set(corpus.map((d) => d.id));
  const path = input.path?.replace(/\/$/, "");
  const fromPath = path ? corpus.find((d) => d.path === path)?.id : undefined;
  return [...new Set([...input.labIds.filter((l) => known.has(l)), ...(fromPath ? [fromPath] : [])])].sort();
}
