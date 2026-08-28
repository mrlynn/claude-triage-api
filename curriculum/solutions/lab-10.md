# Lab 10 answers — Ask Northwind

The correct design has two boundaries, not three: a browser that holds only an
opaque session cookie, and a server-side loop with narrowly scoped tools. The
agent gets no filesystem, no shell, no browser, and no arbitrary network. It
receives trusted surface and page context from the route and treats the
visitor's message — and its own tool output — as untrusted content.

A customer-facing action is a proposal, not a tool call that changes data. The
confirmation route validates an expiring, single-use proposal against the
session and re-derives policy authority before writing a fictional case
record. That is what makes the confirmation meaningful when the model is
mistaken or was prompted to skip it. The claim is one atomic
`findOneAndUpdate` with `usedAt` in the filter, so two simultaneous
confirmations cannot both succeed — a read-then-write would let both through
and record the refund twice.

Authority is enforced twice on purpose, in `assistantPolicy.ts`. The tool
schema deliberately *accepts* an amount above the ceiling: capping it there
would only turn a $900 request into a validation error and leave the outcome
to however the model chose to recover. Accepting it and downgrading it to an
escalation makes the result the same whatever the model intended.

The third boundary — a separate container running the Agent SDK — is the one
worth being able to argue *against*. It is the right answer for an agent that
touches a filesystem or a shell, and the wrong answer for one that calls four
of your own functions: it costs a 213MB binary, a container host, and a cloud
account for anyone attempting the capstone of a course about the Claude API.
Recognising which of those two you are building is the judgement this lab is
really testing.
