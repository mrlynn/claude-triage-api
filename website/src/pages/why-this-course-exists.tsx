import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";

import styles from "./why-this-course-exists.module.css";

export default function WhyThisCourseExists(): ReactNode {
  return (
    <Layout title="Why this course exists" description="Why Claude Triage API is an independent, production-minded course about building reliable AI application features.">
      <main className={`container ${styles.page}`}>
        <p className={styles.eyebrow}>A note from the author</p>
        <h1>Why this course exists</h1>
        <p className={styles.lead}>I made this course because most AI tutorials stop before the decisions that make a feature trustworthy in production: output contracts, tool boundaries, cost visibility, evaluation, and what happens when the system is wrong.</p>
        <section>
          <h2>A course built around consequences</h2>
          <p>The Northwind scenario exists so these decisions have stakes. It is not a generic chatbot exercise: a badly routed support message can delay an injury report, misstate a policy, or leave a customer with no useful answer. The course uses one coherent service so each technique has a reason to exist and can be tested against the next.</p>
        </section>
        <section>
          <h2>Independent work</h2>
          <p>This is an independent personal educational project. I work at Cursor, but this course is not affiliated with, sponsored by, or endorsed by Cursor. The views expressed here are my own.</p>
        </section>
        <section>
          <h2>Why the course uses Claude—and where Cursor fits</h2>
          <p>The course teaches the Claude API because the example service is built on that API. That is a technical teaching choice, not a claim that one product is universally better than another.</p>
          <p>A backend model API and an agent runtime often solve different parts of the stack. This course uses a model API for a customer-support service; Cursor&apos;s agent tools are designed for developer workflows and workspace-based tasks. Where the project discusses Cursor, the aim is to make that architectural distinction clear and reproducible, not to publish a vendor scorecard.</p>
          <Link className="button button--primary" to="/docs/comparison">Read the architecture note</Link>
        </section>
        <section>
          <h2>How to use this material</h2>
          <p>Take the ideas into your own stack, measure the outcomes, and adapt the controls to the consequences your system carries. If something is unclear or you build on it, <a href="https://github.com/mrlynn/claude-triage-api/discussions">join the discussion</a>.</p>
        </section>
      </main>
    </Layout>
  );
}
