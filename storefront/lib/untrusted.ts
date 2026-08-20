import "server-only";

/**
 * HAND-MIRRORED from `src/lib/untrusted.ts` in the API repo.
 *
 * Not generated, and not imported: this app deploys from its own Vercel root
 * directory and cannot reach files above it at build time. Unlike
 * `pricing.generated.ts` — which is plain data and therefore safe to emit —
 * this is behaviour, and generating behaviour across a boundary hides the fact
 * that two copies exist. A reader of this file should be able to see that.
 *
 * If you change the escaping rule, change it in both places. `src/lib/untrusted.ts`
 * is canonical and carries the full reasoning; the short version:
 *
 *   Delimiting untrusted text with tags is necessary and NOT sufficient,
 *   because the customer can close the tag. Escaping `<` removes the primitive
 *   an attacker needs to construct one, which is a whitelist-shaped fix rather
 *   than a blocklist-shaped one.
 *
 * This is the hole the deployed storefront had until Lab 8: the system prompt
 * told the model that text inside the tags was untrusted, and nothing stopped
 * a customer from writing their way out of the tags.
 */

export interface Redaction {
  kind: "card_number" | "ssn";
  at: number;
}

export function wrapUntrusted(text: string, tag = "customer_message"): string {
  const escaped = text.replace(/</g, "&lt;");
  return `<${tag}>\n${escaped}\n</${tag}>`;
}

/** Luhn, so a card number redacts and an order id does not. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Strips identifiers that must never be stored or echoed (handbook §4.5, §7).
 *
 * Redact at the boundary, not in the prompt. Asking the model nicely to ignore
 * a card number still puts it in your request logs and anything downstream
 * that persists a transcript.
 */
export function redactPII(text: string): { text: string; redactions: Redaction[] } {
  const redactions: Redaction[] = [];
  let out = text;

  out = out.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (match, offset: number) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19 || !passesLuhn(digits)) return match;
    redactions.push({ kind: "card_number", at: offset });
    return `[card ending ${digits.slice(-4)}]`;
  });

  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, (_m, offset: number) => {
    redactions.push({ kind: "ssn", at: offset });
    return "[ssn redacted]";
  });

  return { text: out, redactions };
}
