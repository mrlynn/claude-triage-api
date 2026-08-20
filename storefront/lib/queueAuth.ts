import "server-only";
import { cookies } from "next/headers";

/**
 * Access control for the reviewer queue.
 *
 * BE CLEAR ABOUT WHAT THIS IS: a shared bearer token in a cookie. It is not
 * authentication. There is no user model, no per-reviewer identity, no
 * revocation, and no audit trail of who changed what. Anyone with the token is
 * every reviewer.
 *
 * It exists because the alternative was worse. The queue holds real messages
 * submitted by the public through a URL that ends up in slide decks, and
 * leaving that surface open while calling it "just a demo" is not a position
 * worth defending. A shared token you are honest about beats an open endpoint
 * you are quiet about.
 *
 * The UI says so on the page. `docs/architecture.md` lists real auth under
 * deliberate omissions. Both of those matter more than the mechanism: the
 * failure mode for demo security is not that it is weak, it is that someone
 * downstream mistakes it for the real thing.
 *
 * If QUEUE_TOKEN is unset the queue is DISABLED rather than open. A missing
 * secret must never mean "no check required" — that inversion is how staging
 * credentials end up protecting production.
 */

export const QUEUE_COOKIE = "nw_queue";

export type QueueAuth =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "unauthorized" };

/** Constant-time-ish compare. Overkill here, correct habit. */
function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkQueueAccess(request: Request): Promise<QueueAuth> {
  const expected = process.env.QUEUE_TOKEN;
  if (!expected) return { ok: false, reason: "unconfigured" };

  // Either an explicit header (for curl and the labs) or the cookie the
  // /queue page sets from ?token=.
  const header = request.headers.get("x-queue-token");
  if (header && tokensMatch(header, expected)) return { ok: true };

  const jar = await cookies();
  const cookie = jar.get(QUEUE_COOKIE)?.value;
  if (cookie && tokensMatch(cookie, expected)) return { ok: true };

  return { ok: false, reason: "unauthorized" };
}

/** True when the visitor already holds a valid cookie. For server components. */
export async function hasQueueCookie(): Promise<boolean> {
  const expected = process.env.QUEUE_TOKEN;
  if (!expected) return false;
  const jar = await cookies();
  const cookie = jar.get(QUEUE_COOKIE)?.value;
  return Boolean(cookie && tokensMatch(cookie, expected));
}
