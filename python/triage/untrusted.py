"""The trust boundary. Mirrors src/lib/untrusted.ts.

Delimiting untrusted text is necessary and NOT sufficient, because the customer
can close the tag. Escaping `<` removes the character an attacker needs to
construct one, which is a whitelist-shaped fix rather than a blocklist-shaped
one. Same reasoning, same four characters, different language.
"""

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Redaction:
    kind: str
    at: int


def wrap_untrusted(text: str, tag: str = "customer_message") -> str:
    escaped = text.replace("<", "&lt;")
    return f"<{tag}>\n{escaped}\n</{tag}>"


def _passes_luhn(digits: str) -> bool:
    total = 0
    double = False
    for ch in reversed(digits):
        d = int(ch)
        if double:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        double = not double
    return total % 10 == 0


_CARD = re.compile(r"\b(?:\d[ -]?){12,18}\d\b")
_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")


def redact_pii(text: str) -> tuple[str, list[Redaction]]:
    """Redact at the boundary, not in the prompt.

    Card numbers are Luhn-checked so an order id like NW-48211 survives. A
    naive digit-count rule would eat tracking numbers and silently break the
    tool loop, which is a worse failure than the one it prevents.
    """
    found: list[Redaction] = []

    def card(m: re.Match[str]) -> str:
        digits = re.sub(r"\D", "", m.group(0))
        if not (13 <= len(digits) <= 19) or not _passes_luhn(digits):
            return m.group(0)
        found.append(Redaction("card_number", m.start()))
        return f"[card ending {digits[-4:]}]"

    def ssn(m: re.Match[str]) -> str:
        found.append(Redaction("ssn", m.start()))
        return "[ssn redacted]"

    out = _CARD.sub(card, text)
    out = _SSN.sub(ssn, out)
    return out, found
