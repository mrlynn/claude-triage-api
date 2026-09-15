import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ALLOWED_ORIGINS } from "./origins";

/**
 * Session identity and cross-origin rules for Ask Northwind.
 *
 * The agent itself runs in `assistantAgent.ts`, in this app. This file is only
 * the part that decides WHO is asking and WHETHER their origin may ask.
 */
export const ASSISTANT_COOKIE = "northwind_assistant";
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export function readCookie(request: Request, name: string): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function sessionId(request: Request): string | undefined {
  return readCookie(request, ASSISTANT_COOKIE);
}

export function addSessionCookie(response: NextResponse, id = randomUUID()): NextResponse {
  response.cookies.set(ASSISTANT_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    domain: process.env.NODE_ENV === "production" ? ".mlynn.dev" : undefined,
    maxAge: SEVEN_DAYS,
    path: "/",
  });
  return response;
}

/** Only the deployed course and shop may send credentialed assistant requests. */
export function cors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}
