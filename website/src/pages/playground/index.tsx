import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";

import { STOREFRONT_URL, storefront } from "../../urls";

const TOOLS = [
  {
    to: "/mission",
    title: "Northwind learning mission",
    blurb:
      "Make five consequential architecture decisions, predict what changes, then uncover the evidence-backed cost, latency, cache, and safety picture.",
    lab: "Start here",
  },
  {
    to: storefront("/support"),
    title: "The Northwind storefront",
    blurb:
      "A working shop. Browse the gear, file a complaint about it, and watch your own words get classified live.",
    lab: "Scenario",
  },
  {
    to: "/brand",
    title: "Northwind brand",
    blurb:
      "The mark, lockup, and palette for the company the labs are built around. Includes the 18px test that killed three other concepts.",
    lab: "Scenario",
  },
  {
    to: storefront("/playground/live"),
    title: "Watch it read as you type",
    blurb:
      "A live triage preview that fills in category, sentiment and urgency while you write. Then commit the message and see where the cheap model was wrong.",
    lab: "Lab 5",
  },
  {
    to: storefront("/queue"),
    title: "The escalation queue",
    blurb:
      "Where requires_human actually goes. Seven fictional escalations, their reasons, and the states a reviewer moves them through. Read-only without a token.",
    lab: "Lab 8",
  },
  {
    to: storefront("/ops"),
    title: "Priya's operations dashboard",
    blurb:
      "The KPIs a support director reports upward, across a staged rollout. Simulated history, clearly badged, with the real unit economics alongside.",
    lab: "Scenario",
  },
  {
    to: "/playground/policy",
    title: "Set the policy",
    blurb:
      "Pick a model, set the confidence above which a ticket routes itself, run a week of the queue. Haiku reports 0.95 on a safety report it got wrong, so find the threshold that catches that. There isn't one.",
    lab: "Lab 7",
  },
  {
    to: "/playground/find",
    title: "Find the safety report",
    blurb:
      "Twenty tickets from one December morning, two of them safety reports, and a clock. Most people take a minute and change to find the second one.",
    lab: "Scenario",
  },
  {
    to: "/playground/queue",
    title: "The inbound queue",
    blurb:
      "The same twenty tickets, before and after triage, with every field the classifier returned.",
    lab: "Scenario",
  },
  {
    to: "/playground/batch",
    title: "Batch planner",
    blurb:
      "The Batches API is half price and cost 23% more on this workload. Move the prefix size and find the crossover for yours.",
    lab: "Lab 9",
  },
  {
    to: "/playground/injection",
    title: "The trust boundary",
    blurb:
      "Toggle the escaping off and watch a customer message write its way out of the data block. Then meet the attack that escaping does nothing about.",
    lab: "Lab 8",
  },
  {
    to: "/playground/models",
    title: "Model matrix",
    blurb:
      "The same twelve cases across three tiers. The accuracy column is the one that misleads you; the calibration gap is the one that decides anything.",
    lab: "Lab 7",
  },
  {
    to: "/playground/cost",
    title: "Cost explorer",
    blurb:
      "Move the volume, flip caching off, watch the budget bar go red. Measured token counts, real pricing.",
    lab: "Lab 5",
  },
  {
    to: "/playground/trace",
    title: "Agentic loop stepper",
    blurb:
      "Three turns, four tool calls. Watch context accumulate and see why logging the last turn under-reports cost by 3x.",
    lab: "Lab 3",
  },
  {
    to: "/playground/cache",
    title: "Spot the cache bug",
    blurb:
      "Four prompt variants. One caches. All four return 200 with a correct answer, which is the whole problem.",
    lab: "Lab 5",
  },
];

export default function PlaygroundIndex(): ReactNode {
  return (
    <Layout
      title="Playground"
      description="Interactive tools for the Claude triage labs."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Playground</Heading>
        <p style={{ maxWidth: "44rem" }}>
          Things easier to understand by moving than by reading. Nothing here
          calls the API or needs a key, so it is all safe to poke at before you
          have set anything up.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))",
            gap: "1rem",
            marginTop: "1.5rem",
          }}
        >
          {TOOLS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="card padding--md"
              style={{ textDecoration: "none" }}
            >
              <Heading as="h3" style={{ marginBottom: "0.4rem" }}>
                {t.title}
              </Heading>
              <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.85 }}>
                {t.blurb}
              </p>
              <p
                style={{
                  margin: "0.6rem 0 0",
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  opacity: 0.6,
                }}
              >
                {t.lab}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </Layout>
  );
}
