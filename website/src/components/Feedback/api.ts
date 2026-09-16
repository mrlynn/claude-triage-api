import { storefrontApi } from "@site/src/urls";

/**
 * Sends feedback to the storefront, which stores it for the owner's admin
 * console. Credentials are included so a signed-in learner's feedback is
 * attributed; anyone may send it.
 *
 * What is sent is the rating, reasons, an optional comment, the page's path
 * and lab ids. Never the text being rated: a thumbs-down on an assistant reply
 * says which surface, not what the reply said.
 */

export type FeedbackSurface = "page" | "tutor_lesson" | "tutor_hint" | "tutor_review" | "assistant" | "general";
export type Reason = "confusing" | "incorrect" | "broken" | "too_long" | "too_short" | "missing_something";
export type Category = "bug" | "idea" | "content" | "praise" | "other";

export const MAX_COMMENT_CHARS = 1000;

export interface FeedbackPayload {
  /** The site's `baseUrl`, stripped from the path so a page reads the same on every deploy target. */
  baseUrl?: string;
  id?: string;
  surface: FeedbackSurface;
  rating?: "up" | "down" | null;
  reasons?: Reason[];
  category?: Category | null;
  comment?: string | null;
  labIds?: string[];
}

export class FeedbackError extends Error {}

/** The current path, if it is one the storefront will accept. No query string or hash, ever. */
function currentPath(baseUrl = "/"): string | null {
  const { pathname } = window.location;
  const path = baseUrl !== "/" && pathname.startsWith(baseUrl) ? `/${pathname.slice(baseUrl.length)}` : pathname;
  return path.length <= 200 && /^\/[A-Za-z0-9/_.-]*$/.test(path) ? path : null;
}

export async function sendFeedback({ baseUrl, ...payload }: FeedbackPayload): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${storefrontApi()}/api/feedback`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site: "course", path: currentPath(baseUrl), ...payload }),
    });
  } catch {
    throw new FeedbackError("Could not reach the server. Check your connection.");
  }
  const data = (await response.json().catch(() => null)) as { id?: string; detail?: string; error?: string } | null;
  if (!response.ok || !data?.id) {
    if (data?.error === "not_amendable") throw new FeedbackError("That feedback can no longer be changed. Send it as new feedback instead.");
    throw new FeedbackError(data?.detail ?? "Feedback could not be sent. Try again shortly.");
  }
  return data.id;
}
