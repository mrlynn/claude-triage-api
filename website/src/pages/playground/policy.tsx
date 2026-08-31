import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import PolicyDesk from "@site/src/components/PolicyDesk";

export default function PolicyPage(): ReactNode {
  return (
    <Layout
      title="Set the policy"
      description="You have a label and a confidence score. Decide what happens next, then find out what it cost."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Set the policy</Heading>
        <p style={{ maxWidth: "46rem" }}>
          The labs get you a classification and a calibrated confidence score.
          This is the decision that comes after, and it is the one an engineer
          actually owns: given a label and a number, what happens to the ticket?
        </p>
        <p style={{ maxWidth: "46rem" }}>
          Pick a model. Set the confidence above which a ticket routes itself.
          Then run a week of Northwind&rsquo;s queue against your policy and see
          what it cost — in money, in agent hours, and in the answers that went
          out with nobody reading them.
        </p>

        <PolicyDesk />

        <p style={{ marginTop: "2rem", maxWidth: "46rem" }}>
          The threshold is the obvious lever and it is not enough on its own.
          Which failures it catches depends entirely on whether a model&rsquo;s
          confidence drops when it is wrong, and that is the calibration gap in{" "}
          <Link to="/docs/labs/lab-7-choosing-a-model">Lab 7</Link>. For where
          the safety rule comes from, read{" "}
          <Link to="/docs/scenario">the scenario</Link> — it is a clause in a
          handbook because of a specific Tuesday in October 2025.
        </p>
        <p style={{ maxWidth: "46rem" }}>
          Want the queue itself?{" "}
          <Link to="/playground/find">Find the safety report</Link> puts you in
          the agent&rsquo;s chair for ninety seconds first.
        </p>
      </main>
    </Layout>
  );
}
