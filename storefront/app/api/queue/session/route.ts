import { NextResponse } from "next/server";
import { QUEUE_COOKIE } from "@/lib/queueAuth";
import { checkLimits, clientIp } from "@/lib/ratelimit";

/**
 * Exchanges a link token for an httpOnly cookie, then redirects to /queue.
 *
 * WHY A ROUTE HANDLER: cookies can only be modified in a Route Handler or a
 * Server Action. A page server component that calls `cookies().set(...)`
 * throws at request time — which is a sensible restriction, because a GET that
 * mutates state on the way to rendering a page is exactly the pattern that
 * makes prefetching dangerous.
 *
 * The redirect is the point as much as the cookie. Once the token is in an
 * httpOnly cookie it is out of the URL, so it does not survive in browser
 * history, in a `Referer` header on the next outbound link, or in a screenshot
 * of the address bar taken during a demo — which is the realistic way a
 * workshop token leaks.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  // The cheapest endpoint to hammer, since it does no work — throttle it on
  // the same scope so probing here and probing /api/queue share one budget.
  const gate = await checkLimits(clientIp(request.headers), "queue");
  if (!gate.ok) {
    return NextResponse.json(
      { error: "rate_limited", detail: "Too many attempts." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  const response = NextResponse.redirect(new URL("/queue", url.origin));

  if (token) {
    response.cookies.set(QUEUE_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // Eight hours: long enough for a workshop day, short enough that a
      // laptop left open at a conference is not a standing grant.
      maxAge: 60 * 60 * 8,
      path: "/",
    });
  }

  return response;
}
