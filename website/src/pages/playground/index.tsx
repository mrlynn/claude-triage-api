import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";

const TOOLS = [
  {
    to: "/playground/cost",
    title: "Cost explorer",
    blurb:
      "Move the volume, flip caching off, watch the budget bar go red. Measured token counts, real pricing.",
    lab: "Lab 5",
  },
  {
    to: "/playground/trace",
    title: "Agentic loop stepper",
    blurb:
      "Three turns, four tool calls. Watch context accumulate and see why logging the last turn under-reports cost by 3x.",
    lab: "Lab 3",
  },
  {
    to: "/playground/cache",
    title: "Spot the cache bug",
    blurb:
      "Four prompt variants. One caches. All four return 200 with a correct answer, which is the whole problem.",
    lab: "Lab 5",
  },
];

export default function PlaygroundIndex(): ReactNode {
  return (
    <Layout
      title="Playground"
      description="Interactive tools for the Claude triage labs."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Playground</Heading>
        <p style={{ maxWidth: "44rem" }}>
          Things easier to understand by moving than by reading. Nothing here
          calls the API or needs a key, so it is all safe to poke at before you
          have set anything up.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))",
            gap: "1rem",
            marginTop: "1.5rem",
          }}
        >
          {TOOLS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="card padding--md"
              style={{ textDecoration: "none" }}
            >
              <Heading as="h3" style={{ marginBottom: "0.4rem" }}>
                {t.title}
              </Heading>
              <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.85 }}>
                {t.blurb}
              </p>
              <p
                style={{
                  margin: "0.6rem 0 0",
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  opacity: 0.6,
                }}
              >
                {t.lab}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </Layout>
  );
}
