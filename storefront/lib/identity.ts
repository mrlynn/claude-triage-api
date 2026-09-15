import "server-only";
import type { NextResponse } from "next/server";
import { readCookie } from "./assistant";
import { KEY_IDLE_TTL_MS, SESSION_TTL_MS, USER_TTL_MS, byokSettings } from "./byokConfig";
import { ensureIndexes, getDb } from "./mongo";
import { cookieDomainFor } from "./origins";
import { bump } from "./ratelimit";
import { randomToken, sha256 } from "./secrets";

/**
 * Who is asking: GitHub sign-in, sessions, and the one-time trial grant.
 *
 * WHY NOT AUTH.JS. The whole flow is three routes and two fetches. Auth.js
 * would bring an adapter with its own `users`, `accounts` and `sessions`
 * collections shaped for problems this app does not have, on a Next.js major
 * with breaking changes. The part worth being careful about — state, PKCE, the
 * redirect allowlist, hashing the session token — is short enough to read.
 *
 * WHAT IS STORED. A GitHub numeric id and login. No email (no scopes are
 * requested, so there is none to store), no GitHub token (it is used once to
 * read the profile and dropped), and a hash of the session token rather than
 * the token — a database dump is not a pile of replayable cookies.
 */

export const SESSION_COOKIE = "nw_session";
export const OAUTH_COOKIE = "nw_oauth";

export interface UserDoc {
  _id: string; // "gh:<numeric id>"
  login: string;
  grantMicros: number;
  spentMicros: number;
  byokSpentMicros: number;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface SessionDoc {
  _id: string; // sha256(token)
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface KeyDoc {
  _id: string; // the session hash
  userId: string;
  ct: string;
  iv: string;
  tag: string;
  kv: string;
  last4: string;
  verifiedAt: Date;
  sessionSpentMicros: number;
  expiresAt: Date;
}

export interface Session {
  sessionHash: string;
  userId: string;
}

// ---- cookies ------------------------------------------------------------------

export function setCookie(
  response: NextResponse,
  request: Request,
  name: string,
  value: string,
  { maxAgeSec, path = "/" }: { maxAgeSec: number; path?: string },
): void {
  response.cookies.set(name, value, {
    httpOnly: true,
    // Lax, not Strict: the course site and the storefront are the same site
    // (mlynn.dev), so Lax already reaches their cross-origin fetches, and the
    // OAuth cookie has to survive the top-level redirect back from github.com.
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    domain: cookieDomainFor(request.headers.get("host")),
    maxAge: maxAgeSec,
    path,
  });
}

export const clearCookie = (response: NextResponse, request: Request, name: string, path = "/") =>
  setCookie(response, request, name, "", { maxAgeSec: 0, path });

// ---- GitHub ---------------------------------------------------------------------

export interface GithubUser {
  id: number;
  login: string;
  created_at: string;
}

export const callbackUrl = (request: Request) => `${new URL(request.url).origin}/api/auth/github/callback`;

export function githubAuthorizeUrl(request: Request, state: string, challenge: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", callbackUrl(request));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // No `scope`: public profile only. Nothing here needs more, so nothing asks.
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

export async function githubUserFor(request: Request, code: string, verifier: string): Promise<GithubUser> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      redirect_uri: callbackUrl(request),
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const token = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null;
  if (!tokenRes.ok || !token?.access_token) throw new Error(`GitHub token exchange failed (${tokenRes.status})`);

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token.access_token}`,
      "user-agent": "northwind-storefront",
    },
    signal: AbortSignal.timeout(8_000),
  });
  const user = (await userRes.json().catch(() => null)) as Partial<GithubUser> | null;
  // The token goes out of scope here and is never written anywhere.
  if (!userRes.ok || typeof user?.id !== "number" || !user.login || !user.created_at) {
    throw new Error(`GitHub profile read failed (${userRes.status})`);
  }
  return { id: user.id, login: user.login, created_at: user.created_at };
}

// ---- users and grants -----------------------------------------------------------------

/**
 * Upserts the user. The grant is decided exactly once, when the document is
 * inserted, from two tests: is the GitHub account old enough to not be a
 * throwaway, and is today's supply of new grants not used up. A returning
 * user never touches the grant counter.
 */
export async function upsertUser(gh: GithubUser): Promise<UserDoc> {
  await ensureIndexes();
  const db = await getDb();
  const users = db.collection<UserDoc>("users");
  const _id = `gh:${gh.id}`;
  const now = new Date();
  const settings = byokSettings();

  // A pre-read, deliberately: it only decides whether the grant counter moves.
  // The counter itself is still one atomic $inc, and the grant still lands in
  // $setOnInsert, so two concurrent first sign-ins cannot both grant twice.
  const existing = await users.findOne({ _id }, { projection: { _id: 1 } });
  let grantMicros = 0;
  if (!existing) {
    const ageDays = (now.getTime() - new Date(gh.created_at).getTime()) / 86_400_000;
    if (ageDays >= settings.minAccountAgeDays) {
      const day = now.toISOString().slice(0, 10);
      const granted = await bump(`grants:${day}`, 26 * 60 * 60 * 1000);
      if (granted <= settings.grantsDaily) grantMicros = settings.trialGrantMicros;
    }
  }

  const doc = await users.findOneAndUpdate(
    { _id },
    {
      $setOnInsert: { grantMicros, spentMicros: 0, byokSpentMicros: 0, createdAt: now },
      $set: { login: gh.login, lastSeenAt: now, expiresAt: new Date(now.getTime() + USER_TTL_MS) },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!doc) throw new Error("user upsert returned nothing");
  return doc;
}

// ---- sessions -------------------------------------------------------------------------

/** Returns the raw token for the cookie. Only its hash is stored. */
export async function createSession(userId: string): Promise<string> {
  await ensureIndexes();
  const db = await getDb();
  const token = randomToken();
  const now = new Date();
  await db.collection<SessionDoc>("auth_sessions").insertOne({
    _id: sha256(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

/**
 * The session a request carries, or null. The TTL monitor runs about once a
 * minute, so an expired document can briefly still exist: the expiry is
 * checked here too, rather than trusted to have been swept.
 */
export async function lookupSession(request: Request): Promise<Session | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const db = await getDb();
  const doc = await db
    .collection<SessionDoc>("auth_sessions")
    .findOne({ _id: sha256(token), expiresAt: { $gt: new Date() } });
  return doc ? { sessionHash: doc._id, userId: doc.userId } : null;
}

/** Sign-out: the session and any key sealed to it, in the same breath. */
export async function destroySession(sessionHash: string): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection<SessionDoc>("auth_sessions").deleteOne({ _id: sessionHash }),
    db.collection<KeyDoc>("byok_keys").deleteOne({ _id: sessionHash }),
  ]);
}

export async function getUser(userId: string): Promise<UserDoc | null> {
  const db = await getDb();
  return db.collection<UserDoc>("users").findOne({ _id: userId });
}

export async function getKeyDoc(sessionHash: string): Promise<KeyDoc | null> {
  const db = await getDb();
  return db.collection<KeyDoc>("byok_keys").findOne({ _id: sessionHash, expiresAt: { $gt: new Date() } });
}

export const keyExpiry = () => new Date(Date.now() + KEY_IDLE_TTL_MS);

/** A key Anthropic rejected, or one that no longer decrypts, is deleted rather than retried. */
export async function deleteKey(sessionHash: string): Promise<void> {
  const db = await getDb();
  await db.collection<KeyDoc>("byok_keys").deleteOne({ _id: sessionHash });
}
