import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";

import styles from "./legal.module.css";

const UPDATED = "30 August 2026";

export default function Privacy(): ReactNode {
  return (
    <Layout title="Privacy policy" description="What Claude Triage API collects, why, how long it keeps it, and who else sees it.">
      <main className={`container ${styles.page}`}>
        <p className={styles.eyebrow}>Legal</p>
        <h1>Privacy policy</h1>
        <p className={styles.lead}>
          Claude Triage API is a free, independent course. It has no advertising, no
          tracking network, and nothing to sell. This page says exactly what the site
          collects, why, how long it holds it, and who else can see it.
        </p>
        <p className={styles.updated}>Last updated {UPDATED}.</p>

        <section>
          <h2>Who runs this site</h2>
          <p>
            This site is operated by Michael Lynn as an independent personal educational
            project. It is not affiliated with, sponsored by, or endorsed by Anthropic,
            Cursor, or any other company whose products it discusses. &ldquo;Northwind&rdquo; is a
            fictional company invented for the course; it is not a real business and it
            does not sell anything.
          </p>
          <p>
            The course lives at <code>triage.mlynn.dev</code>. The companion demo storefront
            lives at <code>northwind.mlynn.dev</code>. Both are covered by this policy.
          </p>
        </section>

        <section>
          <h2>What the course site collects</h2>
          <p>
            Reading the course requires no account and no sign-in. Specifically:
          </p>
          <ul>
            <li>
              <strong>Page views.</strong> Aggregate page-view analytics through Vercel
              Analytics, so &ldquo;is anyone using this course&rdquo; has an answer. It sets no
              cookie and no cross-site identifier, and it does not build a profile of you.
            </li>
            <li>
              <strong>Your course progress.</strong> Lab progress, mission progress and the
              presenter timer are stored in your own browser&rsquo;s local storage. They never
              leave your device and are never sent to a server. Clearing site data erases
              them.
            </li>
            <li>
              <strong>Search.</strong> Site search runs entirely in your browser against an
              index shipped with the page. Your queries are not sent anywhere.
            </li>
            <li>
              <strong>Server logs.</strong> The host (Vercel) records standard request logs,
              including IP address and user agent, for security and abuse prevention.
            </li>
          </ul>
        </section>

        <section>
          <h2>What the assistant collects</h2>
          <p>
            &ldquo;Ask Northwind&rdquo; is the chat panel in the corner of the course, and the
            support flows on the demo storefront work the same way. When you send it a
            message:
          </p>
          <ul>
            <li>
              A session cookie (<code>northwind_assistant</code>) identifies your conversation
              so replies land in the right transcript. It is a random identifier and holds
              nothing about you. See the <Link to="/cookies">cookie policy</Link>.
            </li>
            <li>
              Your message and the assistant&rsquo;s reply are sent to the Anthropic Claude API to
              produce an answer, and are stored so the conversation has memory of its own
              earlier turns.
            </li>
            <li>
              If you ask the assistant to escalate something to a human, the message and any
              contact detail you typed into it are stored as an escalation record.
            </li>
          </ul>
          <p>
            <strong>Please do not type anything sensitive into the assistant.</strong> It is a
            teaching demo, not a support desk for a real company. Do not enter passwords,
            API keys, payment details, government identifiers, or health information.
          </p>
        </section>

        <section>
          <h2>Signing in with Google</h2>
          <p>
            Where the site offers &ldquo;Sign in with Google&rdquo;, Google returns your name, email
            address, and profile picture. That is the whole of it: the site requests no
            other scope, and it never asks Google for access to your Gmail, Drive,
            Calendar, Contacts, or any other Google service.
          </p>
          <p>
            That information is used only to identify your account and show you your own
            work. It is not sold, rented, or shared with third parties, it is not used for
            advertising, and it is not transferred to anyone except the infrastructure
            providers listed below who need it to run the site. Google&rsquo;s own handling of
            your data is governed by the{" "}
            <a href="https://policies.google.com/privacy">Google Privacy Policy</a>. You can
            revoke this site&rsquo;s access at any time from your{" "}
            <a href="https://myaccount.google.com/permissions">Google account permissions</a>{" "}
            page.
          </p>
        </section>

        <section>
          <h2>How long anything is kept</h2>
          <p>
            Retention is enforced by the database itself, not by anyone remembering to run
            a cleanup job. Records expire on this schedule:
          </p>
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>What</th>
                  <th>Kept for</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Assistant conversations</td>
                  <td>7 days</td>
                </tr>
                <tr>
                  <td>Assistant action proposals (a pending &ldquo;shall I do this?&rdquo;)</td>
                  <td>15 minutes</td>
                </tr>
                <tr>
                  <td>Escalations to a human</td>
                  <td>30 days</td>
                </tr>
                <tr>
                  <td>Rate-limit and daily usage counters</td>
                  <td>Until the window ends</td>
                </tr>
                <tr>
                  <td>Course and lab progress</td>
                  <td>In your browser, until you clear it</td>
                </tr>
                <tr>
                  <td>Google account profile, where you signed in</td>
                  <td>Until you ask for deletion</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Who else sees it</h2>
          <p>
            No data is sold or shared for advertising. Three providers process data because
            the site cannot run without them:
          </p>
          <ul>
            <li>
              <strong>Vercel</strong> — hosting, request logs, and page-view analytics.
            </li>
            <li>
              <strong>MongoDB Atlas</strong> — the database that holds assistant
              conversations and escalations.
            </li>
            <li>
              <strong>Anthropic</strong> — the Claude API, which receives assistant messages
              in order to answer them.
            </li>
          </ul>
          <p>
            Data may also be disclosed where the law requires it, or to investigate abuse of
            the service.
          </p>
        </section>

        <section>
          <h2>Your choices</h2>
          <ul>
            <li>Don&rsquo;t use the assistant, and nothing about you reaches the database at all.</li>
            <li>Clear your browser&rsquo;s site data to erase local progress and the session cookie.</li>
            <li>
              Ask for deletion of anything held about you, or for a copy of it, by emailing
              the address below. Most records expire on their own within 30 days regardless.
            </li>
            <li>
              Revoke Google sign-in access from your{" "}
              <a href="https://myaccount.google.com/permissions">Google account permissions</a> page.
            </li>
          </ul>
        </section>

        <section>
          <h2>Children</h2>
          <p>
            This site is aimed at professional developers and is not directed at children
            under 13. It does not knowingly collect information from them.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            If this policy changes materially, the date at the top of the page changes with
            it. The page history is public in the{" "}
            <a href="https://github.com/mrlynn/claude-triage-api">course repository</a>.
          </p>
        </section>

        <div className={styles.contact}>
          <p>
            Questions, a deletion request, or something this page gets wrong:{" "}
            <a href="mailto:merlynn@gmail.com">merlynn@gmail.com</a>. See also the{" "}
            <Link to="/terms">terms of service</Link> and the{" "}
            <Link to="/cookies">cookie policy</Link>.
          </p>
        </div>
      </main>
    </Layout>
  );
}
