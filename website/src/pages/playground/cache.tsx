import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import CacheInspector from "@site/src/components/CacheInspector";

export default function CachePage(): ReactNode {
  return (
    <Layout
      title="Spot the cache bug"
      description="Four variants of the same request. One caches. Three do not, and all four return HTTP 200 with a correct answer."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Spot the cache bug</Heading>
        <p style={{ maxWidth: "44rem" }}>
          Four versions of the same system prompt. One of them caches. The other
          three do not, and every one of the three returns HTTP 200 with a
          correct answer and no warning of any kind.
        </p>
        <p style={{ maxWidth: "44rem" }}>
          Read each variant and decide before you reveal the usage block. The
          guessing is the exercise.
        </p>

        <CacheInspector />

        <p style={{ marginTop: "2rem" }}>
          Break the real thing yourself in{" "}
          <Link to="/docs/labs/lab-5-prompt-caching">Lab 5, Step 2</Link>, then
          read how the prompt is assembled in{" "}
          <Link to="/docs/architecture">the architecture notes</Link>.
        </p>
      </main>
    </Layout>
  );
}
