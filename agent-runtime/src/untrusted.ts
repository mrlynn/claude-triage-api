/**
 * HAND-MIRRORED from `src/lib/untrusted.ts`, which is canonical and carries
 * the full reasoning. Mirrored for the same reason `storefront/lib/untrusted.ts`
 * is: this service builds from its own Docker context and cannot reach files
 * above it. If you change the escaping rule, change it in all three places.
 *
 * The short version, because the capstone is where it matters most:
 * delimiting untrusted text with tags is necessary and NOT sufficient, since
 * the customer can close the tag. Escaping `<` removes the primitive an
 * attacker needs to construct one — a whitelist-shaped fix, not a blocklist.
 *
 * An agent makes this sharper than a single completion does. A message that
 * escapes its block here is not just talking to a classifier; it is talking to
 * something holding tools and a six-turn loop.
 */
export function wrapUntrusted(text: string, tag = "customer_message"): string {
  const escaped = text.replace(/</g, "&lt;");
  return `<${tag}>\n${escaped}\n</${tag}>`;
}
