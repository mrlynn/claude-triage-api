# Lab 1 — answers

**Q1. Why is the estimate's input count so much larger than your script's?**

`/v1/estimate` counts the full production request: the role instructions plus
the entire policy handbook (~1,400 words) in the system prompt, plus the volatile
context block. Your script sends a bare user message with no system prompt at
all. The difference is the handbook. This is also the first hint that the
handbook is worth caching — it is most of the input on every request.

**Q2. Why is "ends with a period" a bad truncation detector?**

Several reasons, any one of which is fatal: a complete response may
legitimately end with a list item, a code block, a question mark, or a closing
quote; a truncated response may happen to land on a period mid-paragraph; and
JSON responses never end with a period at all. The correct detector is the one
the API gives you: `response.stop_reason === "max_tokens"`. It is exact, and
it costs nothing.

The general principle: when the API tells you something in a structured field,
never re-derive it from the text.

**Q3. Why does `AuthenticationError` map to 500, not 401?**

Because the credential that failed is *ours*, not the caller's — the caller has
no way to fix it and forwarding a 401 falsely tells them their own auth is
wrong. A 500 correctly says the service is misconfigured. (If the service had
its own API-key auth, a genuine 401 from *that* check would be correct — the
distinction is whose credential failed.)

---

## Extension notes

Adding `cache_control` to a short system prompt produces no change because the
prefix is under the ~1024-token minimum. The API does not error, warn, or log —
it silently declines to cache. `cache_creation_input_tokens` stays 0. This
"success with no effect" is the defining characteristic of caching bugs and is
the whole subject of Lab 5.
