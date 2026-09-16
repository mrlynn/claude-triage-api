import "server-only";
import { CALL_RETENTION_DAYS } from "./activity";
import { AMEND_WINDOW_MS, type FeedbackInput, type FeedbackSurface } from "./feedbackPolicy";
import { ensureIndexes, getDb } from "./mongo";
import { randomToken } from "./secrets";

/**
 * Feedback storage. Rules about what may be stored live in `feedbackPolicy.ts`;
 * this file only writes what the route has already cleaned.
 *
 * A RATING IS SAVED ON THE CLICK. Asking for a comment first would lose every
 * thumbs-down from someone who closes the tab, and those are the ones worth
 * having. So the first POST stores the rating and returns an unguessable id,
 * and a second POST with that id may add reasons and a comment — once, within
 * an hour. The id is the only capability: there is no way to read feedback
 * back through the public API, and no way to amend someone else's without it.
 */

export type FeedbackStatus = "new" | "resolved";

export interface FeedbackDoc {
  _id: string;
  surface: FeedbackSurface;
  site: "course" | "storefront";
  rating: "up" | "down" | null;
  reasons: string[];
  category: string | null;
  comment: string | null;
  path: string | null;
  labIds: string[];
  /** Null for anonymous feedback. */
  userId: string | null;
  status: FeedbackStatus;
  createdAt: Date;
  amendedAt: Date | null;
  resolvedAt: Date | null;
  expiresAt: Date;
}

export type Cleaned = Omit<FeedbackInput, "id"> & { comment: string | null; labIds: string[] };

export async function createFeedback(input: Cleaned, userId: string | null): Promise<string> {
  await ensureIndexes();
  const db = await getDb();
  const now = new Date();
  const _id = randomToken();
  await db.collection<FeedbackDoc>("feedback").insertOne({
    _id,
    surface: input.surface,
    site: input.site,
    rating: input.rating,
    reasons: input.reasons,
    category: input.category,
    comment: input.comment,
    path: input.path,
    labIds: input.labIds,
    userId,
    status: "new",
    createdAt: now,
    amendedAt: null,
    resolvedAt: null,
    expiresAt: new Date(now.getTime() + CALL_RETENTION_DAYS * 86_400_000),
  });
  return _id;
}

/**
 * Adds reasons, a comment, or a changed rating to feedback sent in the last
 * hour. One atomic conditional update: the filter is the whole permission
 * check, so a second amend or a late one simply matches nothing.
 */
export async function amendFeedback(id: string, input: Cleaned): Promise<boolean> {
  await ensureIndexes();
  const db = await getDb();
  const result = await db.collection<FeedbackDoc>("feedback").updateOne(
    { _id: id, amendedAt: null, createdAt: { $gte: new Date(Date.now() - AMEND_WINDOW_MS) } },
    {
      $set: {
        ...(input.rating ? { rating: input.rating } : {}),
        reasons: input.reasons,
        ...(input.category ? { category: input.category } : {}),
        comment: input.comment,
        amendedAt: new Date(),
        // A comment is new information, even on feedback already triaged.
        status: "new",
      },
    },
  );
  return result.matchedCount === 1;
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  const db = await getDb();
  await db
    .collection<FeedbackDoc>("feedback")
    .updateOne({ _id: id }, { $set: { status, resolvedAt: status === "resolved" ? new Date() : null } });
}
