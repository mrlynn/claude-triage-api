import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import TraceStepper from "@site/src/components/TraceStepper";

export default function TracePage(): ReactNode {
  return (
    <Layout
      title="Agentic loop stepper"
      description="Step through a three-turn tool-use loop and watch context, and cost, accumulate."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Agentic loop stepper</Heading>
        <p style={{ maxWidth: "44rem" }}>
          One call to <code>/v1/resolve</code>, three turns, four tool calls.
          Step through it and watch two things move: the message stack grows on
          every turn, and so does the bill.
        </p>
        <p style={{ maxWidth: "44rem", fontSize: "0.9rem", opacity: 0.8 }}>
          Token counts are representative of a real run against{" "}
          <code>claude-opus-5</code>. Exact figures move per ticket. The shape
          is what matters.
        </p>

        <TraceStepper />

        <p style={{ marginTop: "2rem" }}>
          This is the question learners most often get wrong:{" "}
          <Link to="/docs/labs/lab-3-tool-use">Lab 3, Q3</Link>. The code that
          gets it right is in{" "}
          <a href="https://github.com/mrlynn/claude-triage-api/blob/main/src/routes/resolve.ts">
            <code>src/routes/resolve.ts</code>
          </a>
          , which iterates the runner rather than awaiting it, precisely so it
          can capture every turn.
        </p>
      </main>
    </Layout>
  );
}
