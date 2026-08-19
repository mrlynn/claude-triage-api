import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";

import styles from "./index.module.css";

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
  { to: "/docs/labs/lab-1-first-call", n: 1, title: "Your first call, and reading usage", time: "20 min" },
  { to: "/docs/labs/lab-2-structured-outputs", n: 2, title: "Structured outputs and schema design", time: "35 min" },
  { to: "/docs/labs/lab-3-tool-use", n: 3, title: "Tool use and the agentic loop", time: "45 min" },
  { to: "/docs/labs/lab-4-streaming", n: 4, title: "Streaming and SSE", time: "30 min" },
  { to: "/docs/labs/lab-5-prompt-caching", n: 5, title: "Prompt caching and cost", time: "35 min" },
  { to: "/docs/labs/lab-6-evals", n: 6, title: "Evals and LLM-as-judge", time: "45 min" },
];

function Hero() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={styles.hero}>
      <div className="container">
        <Heading as="h1" className={styles.heroTitle}>
          {siteConfig.title}
        </Heading>
        <p className={styles.heroTagline}>
          A reference implementation of a customer-support triage service built
          on the Claude API, written to be read and taught from.
        </p>
        <div className={styles.heroButtons}>
          <Link className="button button--primary button--lg" to="/docs/concept-map">
            Start with the concepts
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/labs/lab-1-first-call">
            Jump to Lab 1
          </Link>
        </div>
      </div>
    </header>
  );
}

function Routes() {
  return (
    <section className={styles.section}>
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

function Labs() {
  return (
    <section className={styles.sectionAlt}>
      <div className="container">
        <Heading as="h2">The labs</Heading>
        <p className={styles.sectionLead}>
          Roughly four hours end to end. Solutions included.
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

function Storefront() {
  return (
    <section className={styles.section}>
      <div className="container">
        <Heading as="h2">The scenario is a real place</Heading>
        <p className={styles.sectionLead}>
          Northwind Outfitters is invented, and you can still walk into it.
          Browse the gear, read the warranty you are about to make a claim
          against, then file a support ticket and watch your own words get
          classified by the same schema Lab 2 has you edit.
        </p>
        <div className={styles.heroButtons} style={{ justifyContent: "flex-start" }}>
          <Link className="button button--primary button--lg" to="https://northwind-outfitters.vercel.app">
            Visit Northwind Outfitters
          </Link>
          <Link className="button button--secondary button--lg" to="/playground/queue">
            See the support queue
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Claude API labs"
      description="A teaching-grade reference API demonstrating structured outputs, tool use, streaming, prompt caching, and evals."
    >
      <Hero />
      <main>
        <Routes />
        <Storefront />
        <Labs />
      </main>
    </Layout>
  );
}
