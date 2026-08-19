import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import CostExplorer from "@site/src/components/CostExplorer";

export default function CostPage(): ReactNode {
  return (
    <Layout
      title="Cost explorer"
      description="Interactive cost model for the Claude triage service, using measured token counts and Claude Opus 5 list pricing."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Cost explorer</Heading>
        <p style={{ maxWidth: "44rem" }}>
          Priya has roughly $4,000 a month and peak volume is about 45,000
          tickets. Whether this project ships comes down to one decision, and
          this is the decision. Move the volume, flip caching off, and watch the
          budget bar.
        </p>
        <p style={{ maxWidth: "44rem", fontSize: "0.9rem", opacity: 0.8 }}>
          Token counts are measured from real runs of this repo against{" "}
          <code>claude-opus-5</code>. Prices are list rates at the time of
          writing, mirrored from{" "}
          <code>src/config.ts</code>. Verify against{" "}
          <a href="https://claude.com/pricing">current pricing</a> before
          quoting these numbers to anyone.
        </p>

        <CostExplorer />

        <p style={{ marginTop: "2rem" }}>
          The exercises behind this are in{" "}
          <Link to="/docs/labs/lab-5-prompt-caching">
            Lab 5, prompt caching and cost
          </Link>
          . For the budget in context, see{" "}
          <Link to="/docs/scenario">the scenario</Link>.
        </p>
      </main>
    </Layout>
  );
}
