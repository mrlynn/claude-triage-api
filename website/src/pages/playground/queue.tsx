import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import TicketQueue from "@site/src/components/TicketQueue";

export default function QueuePage(): ReactNode {
  return (
    <Layout
      title="The inbound queue"
      description="Twenty real support tickets, before and after triage. Every classification came from the actual API."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">The inbound queue</Heading>
        <p style={{ maxWidth: "46rem" }}>
          The labs teach you to turn a message into{" "}
          <code>{'{"urgency":"urgent","confidence":0.92}'}</code> and stop
          there. This is the part that happens next, and it is the reason those
          fields exist at all. A confidence score is unjustifiable on paper and
          obvious in a queue.
        </p>
        <p style={{ maxWidth: "46rem" }}>
          Start on <strong>As received</strong> and try to find the safety
          report before you switch.
        </p>

        <TicketQueue />

        <p style={{ marginTop: "2rem", maxWidth: "46rem" }}>
          The tickets live in{" "}
          <a href="https://github.com/mrlynn/claude-triage-api/blob/main/data/inbound-queue.json">
            <code>data/inbound-queue.json</code>
          </a>
          , and running the whole queue is a good extension to{" "}
          <Link to="/docs/labs/lab-2-structured-outputs">Lab 2</Link>. For why
          the safety rule reads the way it does, see{" "}
          <Link to="/docs/scenario">the scenario</Link>.
        </p>
      </main>
    </Layout>
  );
}
