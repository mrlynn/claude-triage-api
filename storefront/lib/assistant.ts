import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const ASSISTANT_COOKIE = "northwind_assistant";
export const ASSISTANT_ORIGIN = process.env.ASSISTANT_ORIGIN ?? "https://agent.northwind.mlynn.dev";
const SEVEN_DAYS = 60 * 60 * 24 * 7;

export type AssistantSurface = "storefront" | "course";

export function sessionId(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ASSISTANT_COOKIE}=`))
    ?.slice(ASSISTANT_COOKIE.length + 1);
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
  const allowed = new Set([
    "https://triage.mlynn.dev",
    "https://northwind.mlynn.dev",
    "http://localhost:3001",
    "http://localhost:3002",
  ]);
  if (origin && allowed.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export function runtimeHeaders(): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const key = process.env.ASSISTANT_RUNTIME_TOKEN;
  if (key) headers.set("Authorization", `Bearer ${key}`);
  return headers;
}
