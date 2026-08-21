import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";

import styles from "./index.module.css";

const STOREFRONT = "https://northwind-outfitters.vercel.app";

/**
 * The landing page assumes nothing.
 *
 * WHAT WAS WRONG: the hero was the site's own title over a description of the
 * artifact, and both buttons ("Start with the concepts", "Jump to Lab 0")
 * presupposed a visitor who had already decided to take a course. Most people
 * who arrive here came from a link in a feed and have not decided anything.
 * They want to know what this is, whether it is any good, and what one thing
 * they can do right now.
 *
 * SO: the hero leads with the problem rather than the artifact, and the first
 * section after it is three doors sized by how much time the visitor actually
 * has. The 60-second door is deliberately first and deliberately not a lab —
 * the fastest way to make someone want the course is to let them watch the
 * finished thing work on a sentence they wrote themselves.
 */

const ROUTES = [
  {
    path: "POST /v1/triage",
    capability: "Structured outputs",
    idea: "The model's output contract is your type system",
  },
  {
    path: "POST /v1/resolve",
    capability: "Tool use",
    idea: "Claude queries your systems and shows its work",
  },
  {
    path: "POST /v1/draft",
    capability: "Streaming",
    idea: "Token-by-token delivery over SSE, with real cost accounting",
  },
  {
    path: "POST /v1/estimate",
    capability: "Token counting",
    idea: "Know the bill before you pay it",
  },
];

const LABS = [
  { to: "/docs/labs/lab-0-scoreboard", n: 1, title: "Your first call, and reading usage", time: "20 min" },
  { to: "/docs/labs/lab-2-structured-outputs", n: 2, title: "Structured outputs and schema design", time: "35 min" },
  { to: "/docs/labs/lab-3-tool-use", n: 3, title: "Tool use and the agentic loop", time: "45 min" },
  { to: "/docs/labs/lab-4-streaming", n: 4, title: "Streaming and SSE", time: "30 min" },
  { to: "/docs/labs/lab-5-prompt-caching", n: 5, title: "Prompt caching and cost", time: "35 min" },
  { to: "/docs/labs/lab-6-evals", n: 6, title: "Evals and LLM-as-judge", time: "45 min" },
];

/*
  Three doors, and the visitor picks by the only thing they actually know at
  this moment: how much time they are willing to spend. Every door is a real
  destination, not a signup — the two short ones need nothing installed, which
  is stated on the tile because "interactive demo" has been devalued into
  meaning "watch a video".
*/
const DOORS = [
  {
    budget: "60 seconds",
    title: "Watch it work on your own words",
    body: "Walk into the fictional shop, tell its support desk something went wrong, and watch a live model categorise it, rank its urgency, and decide whether a person needs to see it.",
    cta: "Open the storefront",
    to: STOREFRONT,
    note: "Nothing to install. No key.",
  },
  {
    budget: "20 minutes",
    title: "Take the pieces apart",
    body: "Break the classifier with a prompt injection. Step an agentic loop one tool call at a time. Find the cache bug that quietly doubles a bill. All of it runs in the page.",
    cta: "Open a playground",
    to: "/playground",
    note: "Nothing to install. No key.",
  },
  {
    budget: "An afternoon",
    title: "Build the whole service",
    body: "From your first API call to an eval harness with an LLM judge, against one coherent codebase you can read end to end. Solutions included for every lab.",
    cta: "Start Lab 1",
    to: "/docs/labs/lab-0-scoreboard",
    note: "Node 20+, an API key, $2–4 of tokens.",
  },
];

/*
  Three of the eight, chosen because they are the ones that land without any
  setup context: one adversarial, one mechanical, one diagnostic. The rest are
  a click away and the full grid is a better place to browse them.
*/
const PLAYGROUNDS = [
  {
    to: "/playground/injection",
    title: "The trust boundary",
    blurb: "Try to talk the classifier into ignoring its instructions. Some of it works.",
  },
  {
    to: "/playground/trace",
    title: "Agentic loop stepper",
    blurb: "One tool call at a time, with the exact message list at every turn.",
  },
  {
    to: "/playground/cache",
    title: "Spot the cache bug",
    blurb: "One line in the prompt kills every cache hit. Find it before the bill does.",
  },
];

function Hero() {
  return (
    <header className={styles.hero}>
      <div className="container">
        <p className={styles.heroEyebrow}>Claude API · hands-on</p>
        <Heading as="h1" className={styles.heroTitle}>
          Learn the Claude API by fixing a support queue that is drowning.
        </Heading>
        <p className={styles.heroTagline}>
          Northwind Outfitters takes 4,100 support tickets a week and sorts them
          by hand. Two attempts at automating it failed. A child&rsquo;s injury
          report sat unrouted for three days because it opened with
          &ldquo;probably nothing.&rdquo; You build the service that fixes
          that &mdash; and every capability you learn is one the fix actually
          needs.
        </p>
        <div className={styles.heroButtons}>
          <Link className="button button--primary button--lg" to={STOREFRONT}>
            See it running
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/docs/labs/lab-0-scoreboard"
          >
            Start Lab 1
          </Link>
        </div>
        <p className={styles.heroFoot}>
          Or read <Link to="/docs/scenario">the scenario</Link> first &mdash;
          every design decision in the labs traces back to it.
        </p>
      </div>
    </header>
  );
}

function StartHere() {
  return (
    <section className={styles.section}>
      <div className="container">
        <Heading as="h2">Start with however long you have</Heading>
        <p className={styles.sectionLead}>
          Two of these three need nothing but a browser.
        </p>
        <div className={styles.doorGrid}>
          {DOORS.map((d) => (
            <div key={d.budget} className={styles.door}>
              <span className={styles.doorBudget}>{d.budget}</span>
              <Heading as="h3" className={styles.doorTitle}>
                {d.title}
              </Heading>
              <p className={styles.doorBody}>{d.body}</p>
              <div className={styles.doorFoot}>
                <Link className="button button--primary" to={d.to}>
                  {d.cta}
                </Link>
                <span className={styles.doorNote}>{d.note}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Routes() {
  return (
    <section className={styles.sectionAlt}>
      <div className="container">
        <Heading as="h2">Four routes, four capabilities</Heading>
        <p className={styles.sectionLead}>
          One domain. Each route introduces exactly one new idea and builds on
          the one before it.
        </p>
        <div className={styles.grid}>
          {ROUTES.map((r) => (
            <div key={r.path} className={styles.card}>
              <code className={styles.cardPath}>{r.path}</code>
              <div className={styles.cardCapability}>{r.capability}</div>
              <p className={styles.cardIdea}>{r.idea}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Playgrounds() {
  return (
    <section className={styles.section}>
      <div className="container">
        <Heading as="h2">Poke at it before you commit to it</Heading>
        <p className={styles.sectionLead}>
          Eight interactive tools, all of them running in the page. Three worth
          starting with:
        </p>
        <div className={styles.grid}>
          {PLAYGROUNDS.map((p) => (
            <Link key={p.to} to={p.to} className={styles.cardLink}>
              <div className={styles.cardCapability}>{p.title}</div>
              <p className={styles.cardIdea}>{p.blurb}</p>
            </Link>
          ))}
        </div>
        <p className={styles.sectionFoot}>
          <Link to="/playground">See all eight</Link>
        </p>
      </div>
    </section>
  );
}

function Labs() {
  return (
    <section className={styles.sectionAlt}>
      <div className="container">
        <Heading as="h2">The labs</Heading>
        <p className={styles.sectionLead}>
          Roughly four hours end to end. Solutions included. You need Node 20 or
          newer, an API key with billing enabled, and about{" "}
          <Link to="/docs/setup">$2&ndash;4 of tokens</Link> for the whole
          sequence.
        </p>
        <div className={styles.labList}>
          {LABS.map((lab) => (
            <Link key={lab.to} to={lab.to} className={styles.labRow}>
              <span className={styles.labNumber}>{lab.n}</span>
              <span className={styles.labTitle}>{lab.title}</span>
              <span className={styles.labTime}>{lab.time}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Claude API labs"
      description="Learn the Claude API by building a real customer-support triage service — structured outputs, tool use, streaming, prompt caching, and evals, against one codebase you can read end to end."
    >
      <Hero />
      <main>
        <StartHere />
        <Routes />
        <Playgrounds />
        <Labs />
      </main>
    </Layout>
  );
}
