import { NextResponse } from "next/server";
import { byokMode } from "@/lib/byokConfig";
import { OAUTH_COOKIE, githubAuthorizeUrl, setCookie } from "@/lib/identity";
import { safeReturnTo } from "@/lib/origins";
import { canSeal, pkceChallenge, randomToken, seal } from "@/lib/secrets";

/**
 * Sign in with GitHub, step one. A top-level navigation, not a fetch: the
 * course site links here with `?returnTo=` and the browser follows redirects.
 *
 * State and the PKCE verifier ride in a short-lived cookie scoped to
 * /api/auth, sealed with the same AES-GCM as a learner's key (under its own
 * AAD), so nothing about the flow sits in a database for the ten minutes
 * someone spends deciding whether to authorise.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  const self = new URL(request.url).origin;
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"), self);

  // Nothing to sign in to: send them back where they were rather than to an error.
  if (byokMode() === "off" || !canSeal()) return NextResponse.redirect(returnTo);

  const state = randomToken();
  const verifier = randomToken();
  const pending = seal(JSON.stringify({ state, verifier, returnTo }), "oauth");

  const response = NextResponse.redirect(githubAuthorizeUrl(request, state, pkceChallenge(verifier)));
  setCookie(response, request, OAUTH_COOKIE, Buffer.from(JSON.stringify(pending)).toString("base64url"), {
    maxAgeSec: 600,
    path: "/api/auth",
  });
  return response;
}
