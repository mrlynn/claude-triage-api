import { NextResponse } from "next/server";
import { readCookie } from "@/lib/assistant";
import { SESSION_TTL_MS } from "@/lib/byokConfig";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  clearCookie,
  createSession,
  githubUserFor,
  setCookie,
  upsertUser,
} from "@/lib/identity";
import { safeReturnTo } from "@/lib/origins";
import { redactSecrets, safeEqual, unseal, type Sealed } from "@/lib/secrets";

/**
 * Sign in with GitHub, step two. GitHub sends the browser back here with a
 * code and the state it was given.
 *
 * Every failure lands on the page the learner came from with `?signin=failed`
 * rather than on a JSON error, because the person reading it is mid-navigation
 * and not holding a fetch.
 */
export const runtime = "nodejs";

interface Pending {
  state: string;
  verifier: string;
  returnTo: string;
}

function readPending(request: Request): Pending | null {
  const raw = readCookie(request, OAUTH_COOKIE);
  if (!raw) return null;
  try {
    const sealed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Sealed;
    const plain = unseal(sealed, "oauth");
    return plain ? (JSON.parse(plain) as Pending) : null;
  } catch {
    return null;
  }
}

function withFlag(url: string, flag: string): string {
  const u = new URL(url);
  u.searchParams.set("signin", flag);
  return u.toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const self = url.origin;
  const pending = readPending(request);
  const returnTo = safeReturnTo(pending?.returnTo ?? null, self);

  const fail = (flag: string) => {
    const response = NextResponse.redirect(withFlag(returnTo, flag));
    clearCookie(response, request, OAUTH_COOKIE, "/api/auth");
    return response;
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // "access_denied" when someone clicks Cancel on GitHub's screen. Not an error.
  if (url.searchParams.get("error")) return fail("cancelled");
  if (!pending || !code || !state || !safeEqual(state, pending.state)) return fail("failed");

  try {
    const gh = await githubUserFor(request, code, pending.verifier);
    const user = await upsertUser(gh);
    const token = await createSession(user._id);
    const response = NextResponse.redirect(withFlag(returnTo, "ok"));
    clearCookie(response, request, OAUTH_COOKIE, "/api/auth");
    setCookie(response, request, SESSION_COOKIE, token, { maxAgeSec: SESSION_TTL_MS / 1000 });
    return response;
  } catch (error) {
    console.error("github sign-in failed", redactSecrets(error));
    return fail("failed");
  }
}
