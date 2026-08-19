# The scenario: Northwind Outfitters

![Northwind Outfitters](../assets/brand/northwind-mark.svg)

Every design decision in this repo came from somewhere. This is the somewhere.

## Why this matters

A support queue is the place where a company finds out it hurt someone.

Not every ticket, obviously. Most of them are a late package or a wrong size.
But the injury report, the allergic reaction, the tent pole that collapsed on a
car, the customer whose fourth message finally says "I've had it" — those arrive
in the same inbox as "do you ship to Canada," written in the same tone, often
with the same subject line. Somebody has to notice.

You can try this yourself. The
[inbound queue](https://claude-triage-labs.vercel.app/playground/queue) shows
twenty real tickets as an agent sees them, unsorted. One is a parent reporting
that their child got sick. See how long it takes you to find it.

Right now that somebody is a human reading 4,100 messages a week, and in
December it is a seasonal hire on their fifth day who has not read the policy
handbook. This is not a story about saving 90 seconds per ticket. It is a story
about a three-day gap between a child's urgent care visit and anyone at the
company knowing it happened.

That is the stake. Everything in this repo — the schema, the calibrated
confidence score, the tool trace, the eval set — is an attempt to make sure the
one message that matters does not sit in a queue for three days because it
opened with "probably nothing."

The techniques are ordinary. Structured outputs, tool use, streaming, caching.
You will use them for something less consequential and they will still be the
same techniques. But the reason to get them *right* — to calibrate the
confidence score, to return the trace, to write the gold case you know will
fail — only shows up when the cost of being wrong is a person rather than a
metric.

Read this page before Lab 1. Most of the questions the labs ask ("why is this
escalation urgent?", "why cap the refund here?", "why does the trace matter?")
have obvious answers once you know the company, and no answer at all without
it.

---

## The company

**You can visit them.** [northwind-outfitters.vercel.app](https://northwind-outfitters.vercel.app)
is a working storefront: the catalog, the warranty terms, a fake order
history, and a support form that runs the real triage service on whatever you
type into it. Everything below is easier to hold once you have looked at the
price tag on a jacket you are about to complain about.

Northwind Outfitters sells outdoor gear. Technical shells, packs, insulated
bottles, tents. Roughly $180M a year, about 78% of it direct to consumer
through the website and the rest through twelve retail stores in the mountain
west.

The business is violently seasonal. A quiet Tuesday in April looks nothing like
the second week of December, and the support team is sized for neither.

They sell on a lifetime workmanship guarantee. Commercially that is the single
most important fact about them. It is why customers pay $189 for a shell jacket,
it makes their support costs structurally higher than their competitors', and it
is why "just deny the claim" is never the right answer, even on an eight-year-old
claim.

---

## The support organization

34 agents. Two supervisors. One director, Priya Raman, who owns the numbers.

| | Average week | Peak week (Nov–Dec) |
|---|---|---|
| Inbound tickets | 4,100 | 11,300 |
| Agents on shift | 34 | 46 (12 seasonal) |
| Median first response | 14 hrs | 41 hrs |

Channel mix is 62% email, 31% chat, 7% phone transcripts that get typed up
after the call. All three land in one queue.

Volume nearly triples at peak and headcount grows by a third, and the twelve
seasonal hires have not read the policy handbook. So in December, the people
handling the most tickets know the least about the rules.

---

## What is actually broken

Triage is manual and it is the bottleneck.

Every inbound message is read by an agent, categorized by hand, and dropped
into one of seven queues. That first read takes 90 seconds to four minutes and
produces no value for the customer. It is pure routing overhead, and it happens
4,100 times a week.

They tried to automate it twice.

**Keyword rules, 2023.** A regex layer that routed on terms like "refund",
"broken", "where is". It is still running and it is right about 61% of the
time. It fails in the ways keyword systems always fail. "This jacket is broken"
routes to product defects correctly. "I'm broken up about how long this is
taking" also routes to product defects. Nobody trusts it, so agents re-triage
everything anyway and the rules layer is now decoration.

**An off-the-shelf classifier, 2024.** Better accuracy, around 84%, and it was
abandoned inside a quarter for a reason that matters more than the number: it
could not explain itself. When it routed a safety report to billing, nobody
could say why, and there was no way to fix that one case without retraining.
Priya killed it after the second audit finding.

So the bar this project has to clear is not really about accuracy at all.
**Classify the ticket so a supervisor can audit the decision and an engineer can
correct it on a Tuesday afternoon.**

---

## The incident

In October 2025 a customer wrote in about an insulated bottle. The liner had
degraded and their daughter had an allergic reaction to something in the water,
serious enough for an urgent care visit.

The message opened with "Hi, probably nothing, but..."

It sat in the general queue for three days. The keyword layer saw no defect
words. The agent who eventually picked it up handled it well, but by then the
company had a three-day gap between a reported injury and anyone at Northwind
knowing about it. Legal found out from the customer's attorney.

Handbook version 4.2, effective January 2026, is the direct result. It added
section 5.4: safety reports reach the safety queue within one hour, no
exceptions, **even if the customer says it is not a big deal.** That last clause
is in the handbook because of the phrase "probably nothing."

So safety sits apart from the other labels in `CategoryEnum`. A false negative
there is unacceptable and a false positive costs almost nothing. When you get
to Lab 6 and see `eval-04` and the
casually-worded safety case in Step 3, you are looking at this incident encoded
as a test.

---

## Why the money rules exist

**The $200 agent refund ceiling (clause 2.7)** came from a 2024 case where an
agent, trying to save an angry customer, refunded $4,800 across six
transactions over two days. No malice, no policy at the time, and the customer
was genuinely upset. The ceiling exists so that a single agent under pressure
cannot make a decision that size alone, and the anti-splitting language exists
because the first version of the rule was trivially routed around.

**The 5–7 business day refund language (clause 2.3)** exists because agents
kept promising "today" and customers kept escalating on day two when the money
had not appeared. The refund was always fine. The promise was the problem.

**Clause 6.3, no goodwill discounts before the problem is fixed,** came from
survey data. Customers offered a discount code before a resolution rated the
interaction lower than customers offered nothing at all. It reads as being paid
to go away.

Every one of these is the shape support policy takes at a company that has been
doing this long enough. That is why the resolution agent in `/v1/resolve` reads
policy instead of reasoning from first principles about what seems fair.

---

## The brief

What Priya asked engineering for, in her words, reconstructed from the doc that
started this project:

> Read the message. Tell me what it is, how urgent it is, and whether a human
> needs to touch it. Show me why you decided that. Do not tell me you are 95%
> sure when you are guessing.

Those four sentences map one to one onto the routes in this repo.

| Her requirement | What it became |
|---|---|
| "Tell me what it is" | `POST /v1/triage`, a validated classification |
| "Show me why you decided that" | the tool trace on `POST /v1/resolve` |
| "Whether a human needs to touch it" | `requires_human` plus escalation rules |
| "Do not tell me you are 95% sure when you are guessing" | the calibrated `confidence` field |

That last one is the requirement everybody skips. It is also the one that
killed the 2024 classifier, and it is why `confidence` in `TriageSchema` carries
an explicit calibration instruction rather than a bare `z.number()`.

---

## Constraints

These are the non-negotiables the design had to live inside.

**Budget.** Priya has roughly $4,000 a month for this. There is an
[interactive model of this](https://claude-triage-labs.vercel.app/playground/cost)
if you would rather move the numbers than read them. At peak that is about
45,000 tickets, which is a hair under nine cents per ticket end to end. The
cached prefix — role instructions plus the full handbook — measures about 3,400
tokens, and it goes out on every request, so without prompt caching that prefix
alone would eat the entire budget. Lab 5 is the difference between this project
shipping and not.

**Auditability.** Every automated decision touching money or safety has to be
reconstructable six months later. This is why `/v1/resolve` returns the full
tool trace and why the system prompt prescribes a fixed lookup order. A correct
answer that cannot be explained is what got the last system cancelled.

**No autonomous action.** The system recommends. It does not issue refunds, it
does not send replies unreviewed, and it does not close tickets. Every route
here produces a recommendation or a draft that a human approves. That
constraint is doing more security work than any prompt instruction, and it is
the real answer to the prompt-injection question in Lab 6.

**Policy changes weekly.** Legal updates the handbook constantly. The system
cannot have policy baked into prompts or, worse, into code. It reads the
handbook, which is why the handbook is a file and not a paragraph.

---

## How success is measured

Priya reports on four numbers. They are worth knowing because they explain why
the labs measure what they measure.

- **Time to first response**, especially at peak. Triage overhead is the
  removable part.
- **Mis-routing rate.** Currently 23%. Every mis-route costs a re-read and a
  re-queue.
- **Safety time-to-queue.** Target is one hour and the tolerance is zero.
- **Agent-hours on triage.** The number she wants to move to zero so those
  hours go to actually resolving things.

Her dashboard is at [northwind-outfitters.vercel.app/ops](https://northwind-outfitters.vercel.app/ops). The
twelve-month history there is invented and labelled as such; the unit
economics, the eval accuracy and the category mix are real.

Notice what is not on the list. Nobody is measured on model accuracy. Accuracy
is a proxy, and the eval set in this repo exists to keep that proxy honest, not
because 91.7% is the goal.

---

## The people you will keep meeting

**Priya Raman, Director of Support.** Owns the four numbers. Has been burned by
an unexplainable system once and will not be again. When a lab asks "what would
you tell your PM," she is the PM.

**Marco Silva, senior agent, six years.** Handles the hard tickets. Knows the
handbook better than the handbook does. His actual fear about this project is
that it will confidently hand him a wrong recommendation and he will be the one
who signed off. Read the draft replies in Lab 4 as though Marco is about to put
his name on them.

**Dana Kim, customer.** Trail Club member since 2023, $3,100 lifetime value,
appears in `data/orders.json` with a jacket whose zipper separated. She is the
happy path.

**The December seasonal hire.** No name, twelve of them, started last week, has
not read the handbook. The system exists for this person more than anyone.

---

## Where this API sits

Today:

```
inbound  ->  keyword rules (61%)  ->  human re-triage  ->  queue  ->  agent
```

With this service:

```
inbound  ->  POST /v1/triage      ->  queue  ->  agent
                    |                            |
                    +-> requires_human? ---------+
                    |
             POST /v1/resolve  (recommendation + trace, agent approves)
                    |
             POST /v1/draft    (reply draft, agent edits and sends)
```

The human never leaves the loop. The routing read goes away.

---

## Reading the repo through the story

Every one of these is a thing you will hit in a lab, and the story is the
reason it is there.

| In the code | Because |
|---|---|
| `safety` outranks every category | the October 2025 incident |
| "even if the customer says it is not a big deal" | the phrase "probably nothing" |
| `confidence` has a calibration instruction | the 2024 classifier died of false certainty |
| `/v1/resolve` returns a tool trace | the audit findings |
| the handbook is a file, not a prompt | legal changes it weekly |
| prompt caching on the handbook prefix | $4,000 a month against 45,000 peak tickets |
| `requires_human` on every classification | no autonomous action, ever |
| `within_agent_authority` in `ResolutionSchema` | the $4,800 refund in 2024 |
| the 5–7 day refund language in the drafter | agents promising "today" |
| `eval-11` is deliberately ambiguous | real tickets are multi-intent and messy |

---

## A note on what is fictional

Northwind Outfitters is invented. The company, the people, the incident, and
the numbers are all made up for teaching.

The *shapes* are not. Manual triage as a bottleneck, a keyword layer nobody
trusts, a classifier cancelled for being unexplainable, a refund ceiling
written after an expensive afternoon, and a safety rule written after a bad
one, are what support organizations actually look like. If you are porting this
to your own domain, the exercise is to write down the real story you already
have, and then check whether your schema, your tools, and your gold set reflect
it.

Most of the time they do not, and that gap is the actual work.

---

Next: [Setup](setup.md) to get the service running, then
[Lab 1](labs/lab-1-first-call.md).
