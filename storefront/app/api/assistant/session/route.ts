import { NextResponse } from "next/server";
import { addSessionCookie, cors, sessionId } from "@/lib/assistant";

export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204, headers: { "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } }));
}

export async function POST(request: Request) {
  const existing = sessionId(request);
  const response = NextResponse.json({ session: existing ?? "created", expires_in_days: 7 });
  if (!existing) addSessionCookie(response);
  return cors(request, response);
}
