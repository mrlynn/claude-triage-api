import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import FindTheTicket from "@site/src/components/FindTheTicket";

export default function FindPage(): ReactNode {
  return (
    <Layout
      title="Find the safety report"
      description="Twenty support tickets from one December morning. Two of them are safety reports. Time yourself."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Find the safety report</Heading>
        <p style={{ maxWidth: "44rem" }}>
          A support queue is the place where a company finds out it hurt
          someone. Most of it is a late package or a wrong size. The injury
          report arrives in the same inbox, with the same subject line, and
          somebody has to notice.
        </p>
        <p style={{ maxWidth: "44rem" }}>
          These are twenty real tickets from the Northwind queue. You get six to
          start and the rest land while you read. Find the two that need a human
          before the last one arrives.
        </p>

        <FindTheTicket />

        <p style={{ marginTop: "2rem", maxWidth: "44rem" }}>
          When you are done, <Link to="/playground/queue">the inbound queue</Link>{" "}
          shows the same twenty before and after triage, with every field the
          classifier returned. The company and the incident behind this exercise
          are on <Link to="/docs/scenario">the scenario page</Link>, and you
          build the classifier itself in{" "}
          <Link to="/docs/labs/lab-2-structured-outputs">Lab 2</Link>.
        </p>
      </main>
    </Layout>
  );
}
