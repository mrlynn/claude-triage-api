import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import BatchPlanner from "@site/src/components/BatchPlanner";

export default function BatchPage(): ReactNode {
  return (
    <Layout
      title="Batch planner"
      description="The Batches API is half price. On this workload it cost 23% more. Find the crossover for yours."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Batch planner</Heading>
        <p style={{ maxWidth: "44rem" }}>
          The Batches API bills at half rate, which makes it the obvious tool
          for a queue nobody reads in real time. Run against this repo&rsquo;s
          twenty tickets, it was the slowest option and the most expensive
          &mdash; <strong>$0.2018</strong> against <strong>$0.1645</strong>{" "}
          synchronous.
        </p>
        <p style={{ maxWidth: "44rem" }}>
          The reason is that a prompt-cache read is 90% off and the batch
          discount is 50% off, and they apply to the same tokens. The
          synchronous runs hit the cache 20 times out of 20; the batch managed
          11. Two discounts on the same tokens compete &mdash; they do not
          compose.
        </p>

        <BatchPlanner />

        <p style={{ marginTop: "2rem" }}>
          Run the comparison yourself, and read the rate-limit headers you have
          been ignoring, in{" "}
          <Link to="/docs/labs/lab-9-shipping-it">Lab 9</Link>. The per-request
          cost model is in the{" "}
          <Link to="/playground/cost">cost explorer</Link>.
        </p>
      </main>
    </Layout>
  );
}
