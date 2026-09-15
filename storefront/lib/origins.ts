/**
 * The sites allowed to make credentialed requests here, and to be sent back to
 * after sign-in. One list, because an origin trusted with the cookie and an
 * origin trusted as a redirect target are the same trust decision.
 *
 * No `server-only` import, so `origins.test.ts` can check the redirect rules.
 */
export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "https://triage.mlynn.dev",
  "https://northwind.mlynn.dev",
  "http://localhost:3001",
  "http://localhost:3002",
]);

/**
 * An allowlisted origin, or the storefront itself. The second case is what
 * keeps a Vercel preview deployment working: its own pages are same-origin
 * and on no list.
 */
export function isTrustedOrigin(origin: string | null, self: string): boolean {
  return origin !== null && (ALLOWED_ORIGINS.has(origin) || origin === self);
}

/**
 * Where to send someone after sign-in. Parsed as a URL and compared by origin,
 * never by string prefix: `https://triage.mlynn.dev.evil.com` starts with an
 * allowed origin, and `//evil.com` is a path to a naive check. Anything that
 * does not resolve to a trusted origin goes to the storefront home page.
 */
export function safeReturnTo(candidate: string | null, self: string): string {
  if (!candidate) return `${self}/`;
  try {
    const url = new URL(candidate, self);
    if (url.protocol !== "https:" && url.protocol !== "http:") return `${self}/`;
    return isTrustedOrigin(url.origin, self) ? url.toString() : `${self}/`;
  } catch {
    return `${self}/`;
  }
}

/**
 * The cookie domain for a request. Shared across `*.mlynn.dev` so the course
 * site's requests to the storefront carry it; host-only everywhere else, so a
 * preview deployment or localhost can still set one at all.
 */
export function cookieDomainFor(host: string | null): string | undefined {
  const name = (host ?? "").split(":")[0] ?? "";
  return name === "mlynn.dev" || name.endsWith(".mlynn.dev") ? ".mlynn.dev" : undefined;
}
