import { cors } from "@/lib/assistant";
import { accountFor } from "@/lib/funding";
import { redactSecrets } from "@/lib/secrets";

/**
 * What the meter shows: who you are, how much credit is left, and whether a
 * key of yours is in use. Anonymous is a valid answer, not an error.
 */
export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return cors(
    request,
    new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "GET, OPTIONS" } }),
  );
}

export async function GET(request: Request) {
  try {
    const account = await accountFor(request);
    return cors(request, Response.json(account, { headers: { "Cache-Control": "private, no-store" } }));
  } catch (error) {
    console.error("account lookup failed", redactSecrets(error));
    return cors(request, Response.json({ error: "store_error" }, { status: 503 }));
  }
}
