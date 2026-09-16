import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { parseAdminIds } from "./adminPolicy";
import { SESSION_COOKIE, type SessionDoc, type UserDoc } from "./identity";
import { ensureIndexes, getDb, HAS_MONGO } from "./mongo";
import { sha256 } from "./secrets";

/**
 * Who may open /admin: a signed-in GitHub account whose numeric id is listed in
 * ADMIN_GITHUB_IDS. Unlike the queue's shared token (`queueAuth.ts`), this is a
 * real identity check on the session learners already use, because the admin
 * console shows named people's activity and a token in a slide deck cannot
 * guard that.
 *
 * EVERY FAILURE IS A 404. Signed out, not an admin, or ADMIN_GITHUB_IDS unset:
 * the page does not exist. An unset list means nobody, never everybody — the
 * same inversion `queueAuth.ts` refuses. To sign in, open
 * /api/auth/github/start?returnTo=/admin, which needs BYOK_MODE shadow or enforce.
 *
 * Every admin page calls `requireAdmin()` itself. A check in the layout alone
 * is not enough: layouts do not re-render on client navigation between the
 * pages beneath them, so a page must never rely on its parent having checked.
 */

export interface Admin {
  userId: string;
  login: string;
}

async function lookup(): Promise<Admin | null> {
  // First, before any early return. Without it, a build where ADMIN_GITHUB_IDS
  // is unset returns before touching cookies, Next concludes the page is
  // static, and it prerenders a 404 that production then serves to the admin.
  await connection();
  const admins = parseAdminIds(process.env.ADMIN_GITHUB_IDS);
  if (admins.size === 0 || !HAS_MONGO) return null;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  await ensureIndexes();
  const db = await getDb();
  const session = await db
    .collection<SessionDoc>("auth_sessions")
    .findOne({ _id: sha256(token), expiresAt: { $gt: new Date() } });
  if (!session || !admins.has(session.userId)) return null;

  const user = await db.collection<UserDoc>("users").findOne({ _id: session.userId }, { projection: { login: 1 } });
  return user ? { userId: user._id, login: user.login } : null;
}

/** Once per request, however many components ask. */
const current = cache(lookup);

export async function requireAdmin(): Promise<Admin> {
  const admin = await current();
  if (!admin) notFound();
  return admin;
}
