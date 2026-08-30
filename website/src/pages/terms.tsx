import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";

import styles from "./legal.module.css";

const UPDATED = "30 August 2026";

export default function Terms(): ReactNode {
  return (
    <Layout title="Terms of service" description="The terms for using Claude Triage API, a free independent course and its demo storefront.">
      <main className={`container ${styles.page}`}>
        <p className={styles.eyebrow}>Legal</p>
        <h1>Terms of service</h1>
        <p className={styles.lead}>
          Claude Triage API is a free educational course and a demo application that goes
          with it. Using either means agreeing to what is on this page.
        </p>
        <p className={styles.updated}>Last updated {UPDATED}.</p>

        <section>
          <h2>What this is</h2>
          <p>
            &ldquo;The service&rdquo; means the course at <code>triage.mlynn.dev</code>, the demo
            storefront at <code>northwind.mlynn.dev</code>, and the assistant that runs on
            both. It is operated by Michael Lynn as an independent personal educational
            project, and is not affiliated with, sponsored by, or endorsed by Anthropic,
            Cursor, or any other company whose products it discusses.
          </p>
          <p>
            <strong>Northwind is fictional.</strong> The storefront sells nothing, ships
            nothing, and takes no payment. Prices, products, orders, policies and support
            replies are teaching material. Nothing produced by the demo — including
            anything the assistant says about refunds, warranties, or shipping — creates an
            obligation to anyone.
          </p>
        </section>

        <section>
          <h2>Using the service</h2>
          <p>You may read the course, run the labs, and use the demo freely. You may not:</p>
          <ul>
            <li>Use the service to break the law, or to harm, harass, or defraud anyone.</li>
            <li>
              Attempt to gain unauthorised access to the service, its database, its API
              keys, or any account that is not yours.
            </li>
            <li>
              Overload it — automated scraping, load testing, or bulk requests against the
              assistant or the API. Rate limits are in place; do not work around them.
            </li>
            <li>
              Submit other people&rsquo;s personal information, or anything sensitive. The demo
              is not a safe place for it.
            </li>
            <li>Misrepresent the service, or Northwind, as a real commercial offering.</li>
          </ul>
          <p>
            Access may be suspended for any of the above, without notice, since there is no
            account to suspend and no payment to refund.
          </p>
        </section>

        <section>
          <h2>Your account, where you have one</h2>
          <p>
            Where the service offers sign-in, you are responsible for the security of the
            account you sign in with. Tell us if you believe it has been misused. You may
            ask for your account and its data to be deleted at any time, and access may be
            withdrawn at any time — this is a teaching demo, not a service anyone should
            depend on.
          </p>
        </section>

        <section>
          <h2>AI output</h2>
          <p>
            The assistant and the triage service are powered by large language models. Their
            output can be wrong, incomplete, or confidently mistaken — demonstrating that,
            and the controls that contain it, is a large part of what the course teaches.
          </p>
          <p>
            Do not rely on anything the service produces as legal, financial, medical, or
            professional advice, and verify any code or configuration it generates before
            running it anywhere that matters.
          </p>
        </section>

        <section>
          <h2>Content and licensing</h2>
          <p>
            The source code is published in the{" "}
            <a href="https://github.com/mrlynn/claude-triage-api">course repository</a> under
            the licence stated there; that licence governs the code, and you should read it
            before reusing anything. The written course material is provided for learning
            and may be quoted with attribution. Third-party names and marks belong to their
            owners.
          </p>
          <p>
            Anything you type into the assistant stays yours. You grant only the permission
            needed to run the service on it — process it, answer it, and store it for the
            retention periods in the <Link to="/privacy">privacy policy</Link>.
          </p>
        </section>

        <section>
          <h2>No warranty</h2>
          <p>
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranty of any
            kind, express or implied, including merchantability, fitness for a particular
            purpose, and non-infringement. It may be offline, incomplete, or discontinued at
            any time. There is no uptime commitment and no support obligation.
          </p>
        </section>

        <section>
          <h2>Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, the operator is not liable for any
            indirect, incidental, special, consequential, or punitive damages, or for any
            loss of data, profits, or business, arising from your use of the service. Since
            the service is free, total liability for any claim is limited to zero.
          </p>
        </section>

        <section>
          <h2>Changes and governing law</h2>
          <p>
            These terms may change; the date at the top changes with them, and continuing to
            use the service means accepting the revision. These terms are governed by the
            laws of the Commonwealth of Massachusetts, United States, without regard to its
            conflict-of-law rules.
          </p>
        </section>

        <div className={styles.contact}>
          <p>
            Questions about these terms: <a href="mailto:merlynn@gmail.com">merlynn@gmail.com</a>.
            See also the <Link to="/privacy">privacy policy</Link> and the{" "}
            <Link to="/cookies">cookie policy</Link>.
          </p>
        </div>
      </main>
    </Layout>
  );
}
