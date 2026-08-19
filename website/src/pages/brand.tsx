import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import NorthwindLogo, {
  NorthwindMark,
} from "@site/src/components/NorthwindLogo";

const PALETTE = [
  { name: "Pine", hex: "#1F3D33", use: "badge, primary text" },
  { name: "Spruce", hex: "#5C9A86", use: "rear summit, secondary" },
  { name: "Bone", hex: "#F2EDE4", use: "front summit, light ground" },
  { name: "Ember", hex: "#D9642A", use: "accent only, never in the mark" },
  { name: "Slate", hex: "#8A9A93", use: "muted text, rules" },
];

const SIZES = [96, 64, 40, 24, 18];

export default function BrandPage(): ReactNode {
  return (
    <Layout
      title="Northwind Outfitters brand"
      description="The mark, lockup, and palette for the fictional company the labs are built around."
    >
      <main className="container margin-vert--lg">
        <Heading as="h1">Northwind Outfitters</Heading>
        <p style={{ maxWidth: "44rem" }}>
          Northwind is invented. It exists so the labs have a real company with
          real constraints instead of a generic{" "}
          <code>{"{ foo: bar }"}</code> domain. Giving it a mark is not
          decoration — a support queue full of tickets from a company with a
          logo feels like a support queue. Read{" "}
          <Link to="/docs/scenario">the scenario</Link> for who they are.
        </p>

        <section className="margin-top--lg">
          <Heading as="h2">Lockup</Heading>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "2.5rem",
              alignItems: "center",
              padding: "2rem",
              border: "1px solid var(--ifm-toc-border-color)",
              borderRadius: "var(--ifm-global-radius)",
            }}
          >
            <NorthwindLogo size={56} showTagline />
            <NorthwindLogo size={36} />
          </div>
        </section>

        <section className="margin-top--lg">
          <Heading as="h2">The mark at every size that matters</Heading>
          <p style={{ maxWidth: "44rem" }}>
            The 18px column is the one that decided the design. Three other
            concepts looked better large and turned to mush here.
          </p>
          <div
            style={{
              display: "flex",
              gap: "2rem",
              alignItems: "flex-end",
              flexWrap: "wrap",
              padding: "1.5rem",
              border: "1px solid var(--ifm-toc-border-color)",
              borderRadius: "var(--ifm-global-radius)",
            }}
          >
            {SIZES.map((s) => (
              <div key={s} style={{ textAlign: "center" }}>
                <NorthwindMark size={s} />
                <div style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: "0.4rem" }}>
                  {s}px
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="margin-top--lg">
          <Heading as="h2">Variants</Heading>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
              gap: "1rem",
            }}
          >
            <div
              style={{
                padding: "1.5rem",
                borderRadius: "var(--ifm-global-radius)",
                border: "1px solid var(--ifm-toc-border-color)",
                background: "#F2EDE4",
                textAlign: "center",
              }}
            >
              <NorthwindMark size={64} />
              <p
                style={{
                  margin: "0.75rem 0 0",
                  fontSize: "0.82rem",
                  color: "#1F3D33",
                }}
              >
                Primary, on light
              </p>
            </div>
            <div
              style={{
                padding: "1.5rem",
                borderRadius: "var(--ifm-global-radius)",
                background: "#12211c",
                textAlign: "center",
              }}
            >
              <NorthwindMark size={64} variant="inverted" />
              <p style={{ margin: "0.75rem 0 0", fontSize: "0.82rem", color: "#EAF2EE" }}>
                Inverted, on dark
              </p>
            </div>
            <div
              style={{
                padding: "1.5rem",
                borderRadius: "var(--ifm-global-radius)",
                border: "1px solid var(--ifm-toc-border-color)",
                textAlign: "center",
                color: "var(--ifm-font-color-base)",
              }}
            >
              <NorthwindMark size={64} variant="mono" />
              <p style={{ margin: "0.75rem 0 0", fontSize: "0.82rem" }}>
                Mono, follows currentColor
              </p>
            </div>
          </div>
        </section>

        <section className="margin-top--lg">
          <Heading as="h2">Palette</Heading>
          <div style={{ display: "grid", gap: "0.5rem", maxWidth: "34rem" }}>
            {PALETTE.map((c) => (
              <div
                key={c.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.9rem",
                  padding: "0.5rem 0.7rem",
                  border: "1px solid var(--ifm-toc-border-color)",
                  borderRadius: "var(--ifm-global-radius)",
                }}
              >
                <span
                  style={{
                    width: "2.2rem",
                    height: "2.2rem",
                    borderRadius: "6px",
                    background: c.hex,
                    border: "1px solid rgba(128,128,128,0.35)",
                    flex: "0 0 auto",
                  }}
                />
                <strong style={{ width: "4.5rem" }}>{c.name}</strong>
                <code style={{ width: "5.5rem" }}>{c.hex}</code>
                <span style={{ fontSize: "0.85rem", opacity: 0.75 }}>{c.use}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="margin-top--lg">
          Source SVGs live in{" "}
          <a href="https://github.com/mrlynn/claude-triage-api/tree/main/assets/brand">
            <code>assets/brand/</code>
          </a>
          .
        </p>
      </main>
    </Layout>
  );
}
