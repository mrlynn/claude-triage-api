# Lab 4 — answers

**Q1. What does `display` control?**

Visibility only. Thinking happens and is billed identically under every
setting; the raw chain of thought is never exposed on any model. `"summarized"`
returns a readable summary in the `thinking` blocks; `"omitted"` — the default
on this model family — leaves the text empty.

The bad first-run UX: with the default, a streaming client sees `thinking`
events with no content, then nothing at all for however long reasoning takes,
then a burst of text. To a user that is indistinguishable from a hung request.
Teams commonly "fix" this by disabling thinking, which costs them quality; the
actual fix is one parameter.

**Q2. Why `finalMessage()` over a hand-rolled promise?**

`finalMessage()` handles completion, error, and abort internally and resolves
or rejects appropriately in all three. A hand-rolled
`new Promise(res => stream.on("message", res))` handles only the happy path: on
an upstream error or an abort, the `message` event never fires, the promise
never settles, and the request hangs until something else times it out. You
would then need to wire `.on("error")` and `.on("abort")` yourself and get the
race between them right.

General principle: don't reimplement SDK helpers. They exist because the edge
cases are not obvious.

**Q3. Which header, and what else buffers?**

`X-Accel-Buffering: no` is the one that stops nginx (and several other
proxies that honor it) from buffering the response body.

`Cache-Control: no-transform` is there for a different reason: it tells
intermediaries not to *modify* the payload — some CDNs and mobile carrier
proxies compress or rewrite bodies, which breaks SSE framing.

Other layers that can buffer: CDNs (Cloudflare and friends buffer non-streaming
content types), API gateways and load balancers, corporate HTTP proxies, and —
on the client — `curl` without `-N` and any `fetch` wrapper that calls
`res.text()` instead of reading the stream.

**Q4. The rule for a client integrator.**

**Once the response is a stream, a 200 status means "generation started," not
"generation succeeded" — you must handle an in-band `error` event.**

If a client only checks `res.ok`, an upstream failure halfway through delivers
a partial reply with no error surfaced. In this domain that means a
half-written message to a customer, presented to the agent as complete. This is
the single most commonly missed piece of streaming integration.

**Q5. What continues without the abort?**

The upstream request to the Anthropic API keeps generating to completion. You
are billed for every output token, and your process holds the connection and
its memory the whole time. Under load — a UI that fires a request per keystroke,
or users who navigate away from slow responses — this becomes a large and
completely invisible line item, because nothing errors and nothing logs.
