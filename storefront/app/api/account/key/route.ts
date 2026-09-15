import { z } from "zod";
import { cors } from "@/lib/assistant";
import { clientForKey } from "@/lib/anthropicClient";
import { byokMode } from "@/lib/byokConfig";
import { accountFor, storeKey } from "@/lib/funding";
import { deleteKey, lookupSession } from "@/lib/identity";
import { HAS_MONGO } from "@/lib/mongo";
import { isTrustedOrigin } from "@/lib/origins";
import { checkLimits, clientIp } from "@/lib/ratelimit";
import { canSeal, looksLikeApiKey, redactSecrets, seal } from "@/lib/secrets";

/**
 * Add or remove your own Anthropic key.
 *
 * The key arrives in a POST body and leaves this handler sealed. It is never
 * echoed back — the response is the account, which carries only its last four
 * characters — so there is nothing for a script on the page to read after
 * submitting it.
 */
export const runtime = "nodejs";
export const maxDuration = 15;

const Body = z.object({ apiKey: z.string().trim().max(256) });

export async function OPTIONS(request: Request) {
  return cors(
    request,
    new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS" },
    }),
  );
}

const reply = (request: Request, data: unknown, status = 200) =>
  cors(request, Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } }));

async function preamble(request: Request) {
  if (!isTrustedOrigin(request.headers.get("origin"), new URL(request.url).origin)) {
    return { error: reply(request, { error: "bad_origin" }, 403) };
  }
  if (byokMode() === "off" || !HAS_MONGO || !canSeal()) {
    return { error: reply(request, { error: "unconfigured", detail: "Bringing your own key is not enabled on this deployment." }, 503) };
  }
  const session = await lookupSession(request);
  if (!session) {
    return { error: reply(request, { error: "sign_in_required", detail: "Sign in with GitHub before adding a key." }, 401) };
  }
  return { session };
}

export async function POST(request: Request) {
  try {
    const pre = await preamble(request);
    if ("error" in pre) return pre.error;

    const verdict = await checkLimits(clientIp(request.headers), "key");
    if (!verdict.ok) {
      return reply(request, { error: "rate_limited", detail: "Too many key attempts. Try again in a few minutes." }, 429);
    }

    const parsed = Body.safeParse(await request.json().catch(() => null));
    const apiKey = parsed.success ? parsed.data.apiKey : "";
    if (!looksLikeApiKey(apiKey)) {
      return reply(request, { error: "key_malformed", detail: "That does not look like an Anthropic API key. They start with sk-ant-." }, 400);
    }

    // Listing models authenticates the key without generating a token, so a
    // check costs the learner nothing.
    try {
      await clientForKey(apiKey).models.list({ limit: 1 }, { maxRetries: 0, timeout: 8_000 });
    } catch (error) {
      const status = (error as { status?: number }).status;
      return reply(
        request,
        {
          error: "key_invalid",
          detail:
            status === 401 || status === 403
              ? "Anthropic did not accept that key. Check it was copied whole and has not been disabled."
              : "Could not reach Anthropic to verify that key. Try again in a moment.",
        },
        status === 401 || status === 403 ? 402 : 502,
      );
    }

    await storeKey(pre.session.sessionHash, pre.session.userId, seal(apiKey, pre.session.sessionHash), apiKey.slice(-4));
    return reply(request, await accountFor(request));
  } catch (error) {
    console.error("storing a key failed", redactSecrets(error));
    return reply(request, { error: "store_error", detail: "Your key could not be saved. Nothing was stored." }, 503);
  }
}

export async function DELETE(request: Request) {
  try {
    const pre = await preamble(request);
    if ("error" in pre) return pre.error;
    await deleteKey(pre.session.sessionHash);
    return reply(request, await accountFor(request));
  } catch (error) {
    console.error("removing a key failed", redactSecrets(error));
    return reply(request, { error: "store_error", detail: "Your key could not be removed. Try again." }, 503);
  }
}
