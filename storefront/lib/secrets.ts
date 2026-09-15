import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Sealing a learner's Anthropic key, and the other small pieces of crypto the
 * sign-in flow needs. See docs/byok/SPEC.md §5.
 *
 * AES-256-GCM, with the session hash as additional authenticated data. The AAD
 * is what makes a sealed key useless outside the session it was entered in: a
 * row copied into another session's document fails authentication rather than
 * decrypting. GCM's tag also means a flipped byte is a refusal, not a garbled
 * key sent to Anthropic.
 *
 * No `server-only` import, so `secrets.test.ts` can load it. Nothing here is
 * reachable from a client component: nothing on the client imports it.
 */

export interface Sealed {
  ct: string;
  iv: string;
  tag: string;
  /** Which master key sealed it: a fingerprint, so rotation needs no version counter. */
  kv: string;
}

interface MasterKey {
  id: string;
  key: Buffer;
}

function parseMaster(value: string | undefined, name: string): MasterKey | null {
  if (!value) return null;
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    // Loud, because the alternative is a deployment that silently cannot keep
    // anyone's key and looks, from the outside, like every key is invalid.
    throw new Error(`${name} must be 32 bytes, base64-encoded. Generate one with: openssl rand -base64 32`);
  }
  return { id: createHash("sha256").update(key).digest("hex").slice(0, 12), key };
}

function masterKeys(): { current: MasterKey | null; all: MasterKey[] } {
  const current = parseMaster(process.env.BYOK_ENCRYPTION_KEY, "BYOK_ENCRYPTION_KEY");
  const previous = parseMaster(process.env.BYOK_ENCRYPTION_KEY_PREVIOUS, "BYOK_ENCRYPTION_KEY_PREVIOUS");
  return { current, all: [current, previous].filter((k): k is MasterKey => k !== null) };
}

/** True when keys can be stored at all. The key route refuses, with a reason, when this is false. */
export function canSeal(): boolean {
  return masterKeys().current !== null;
}

export function seal(plain: string, aad: string): Sealed {
  const { current } = masterKeys();
  if (!current) throw new Error("BYOK_ENCRYPTION_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ct: ct.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), kv: current.id };
}

/** Null on ANY failure — wrong session, tampered bytes, a rotated-away master key. Never throws. */
export function unseal(sealed: Sealed, aad: string): string | null {
  try {
    const master = masterKeys().all.find((k) => k.id === sealed.kv);
    if (!master) return null;
    const decipher = createDecipheriv("aes-256-gcm", master.key, Buffer.from(sealed.iv, "base64"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(sealed.ct, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]+/g;

/**
 * For every log line on a path that has touched a learner's key. SDK errors
 * can carry request details, and a stack trace is not the place to find out.
 */
export function redactSecrets(value: unknown): string {
  let text: string;
  if (value instanceof Error) text = `${value.name}: ${value.message}\n${value.stack ?? ""}`;
  else if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.replace(KEY_PATTERN, "sk-ant-…");
}

/** The shape of an Anthropic API key, checked before spending a round trip verifying one. */
export function looksLikeApiKey(value: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(value);
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** 32 random bytes, URL-safe. Session tokens, OAuth state, PKCE verifiers. */
export const randomToken = () => randomBytes(32).toString("base64url");

/** PKCE S256: the challenge GitHub stores, derived from the verifier we keep. */
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
