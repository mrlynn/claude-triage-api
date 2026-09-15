import { NextResponse } from "next/server";
import { cors } from "@/lib/assistant";
import { SESSION_COOKIE, clearCookie, destroySession, lookupSession } from "@/lib/identity";
import { HAS_MONGO } from "@/lib/mongo";
import { isTrustedOrigin } from "@/lib/origins";

/** Deletes the session and any key sealed to it, then clears the cookie. */
export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return cors(
    request,
    new Response(null, { status: 204, headers: { "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } }),
  );
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request.headers.get("origin"), new URL(request.url).origin)) {
    return cors(request, Response.json({ error: "bad_origin" }, { status: 403 }));
  }
  if (HAS_MONGO) {
    const session = await lookupSession(request).catch(() => null);
    if (session) await destroySession(session.sessionHash);
  }
  const response = new NextResponse(null, { status: 204 });
  clearCookie(response, request, SESSION_COOKIE);
  return cors(request, response);
}
