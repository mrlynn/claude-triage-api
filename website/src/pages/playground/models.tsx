import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import ModelMatrix from "@site/src/components/ModelMatrix";

export default function ModelsPage(): ReactNode {
  return (
    <Layout
      title="Model matrix"
      description="The same twelve cases across three tiers. Accuracy is the least interesting column."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Model matrix</Heading>
        <p style={{ maxWidth: "44rem" }}>
          The same twelve hand-labelled cases, run against three model tiers.
          Every number comes from an actual run of this repo, emitted by{" "}
          <code>npm run eval:models -- --emit-site</code> rather than typed in.
        </p>
        <p style={{ maxWidth: "44rem" }}>
          Accuracy is the column people quote and the least useful one here.
          Read the calibration gap first — it decides whether you can build a
          confidence threshold on top of a model at all — and then the grid,
          which tells you <em>which</em> cases each tier loses. Those two
          readings disagree with the accuracy ranking more often than you would
          expect.
        </p>

        <ModelMatrix />

        <p style={{ marginTop: "2rem" }}>
          Run it yourself, and build the escalation route that acts on it, in{" "}
          <Link to="/docs/labs/lab-7-choosing-a-model">Lab 7</Link>. The cost
          model behind the monthly projection is in the{" "}
          <Link to="/playground/cost">cost explorer</Link>.
        </p>
      </main>
    </Layout>
  );
}
