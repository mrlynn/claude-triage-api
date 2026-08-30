import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";

import styles from "./legal.module.css";

const UPDATED = "30 August 2026";

export default function Cookies(): ReactNode {
  return (
    <Layout title="Cookie policy" description="Every cookie and browser storage key this site sets, what it holds, and how long it lasts.">
      <main className={`container ${styles.page}`}>
        <p className={styles.eyebrow}>Legal</p>
        <h1>Cookie policy</h1>
        <p className={styles.lead}>
          This site sets no advertising or tracking cookies, and it has no third-party
          trackers to consent to — which is why there is no cookie banner. What it does set
          is listed below in full.
        </p>
        <p className={styles.updated}>Last updated {UPDATED}.</p>

        <section>
          <h2>Cookies</h2>
          <p>
            Reading the course sets no cookie at all. One cookie appears if you use the
            assistant, and one more if you open the instructor queue.
          </p>
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Purpose</th>
                  <th>Lasts</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>northwind_assistant</code></td>
                  <td>
                    A random identifier tying your messages to your own assistant
                    conversation. Holds nothing about you. Set on <code>.mlynn.dev</code> so
                    the course and the storefront share one conversation. HTTP-only, so page
                    scripts cannot read it.
                  </td>
                  <td>7 days</td>
                </tr>
                <tr>
                  <td><code>nw_queue</code></td>
                  <td>
                    Remembers the access token for the instructor queue, so it need not be
                    pasted into the URL on every visit. Only set if you open the queue with
                    a token.
                  </td>
                  <td>8 hours</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Both are strictly necessary for the feature that sets them. Neither follows you
            to other sites.
          </p>
        </section>

        <section>
          <h2>Browser storage</h2>
          <p>
            Most of what the site remembers is not a cookie at all — it is local storage,
            which stays on your device and is never transmitted to a server.
          </p>
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>What</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Mission and lab progress</td>
                  <td>So the course picks up where you left off</td>
                </tr>
                <tr>
                  <td>Slide deck position and presenter timer</td>
                  <td>So a talk survives a reloaded tab</td>
                </tr>
                <tr>
                  <td>Light or dark theme</td>
                  <td>So your choice sticks between visits</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>Clearing site data in your browser erases all of it.</p>
        </section>

        <section>
          <h2>Analytics</h2>
          <p>
            Page views are counted with Vercel Analytics, which sets no cookie and no
            cross-site identifier and does not build a profile of you. It reports how many
            people opened a page, not who they were.
          </p>
        </section>

        <section>
          <h2>Turning them off</h2>
          <p>
            Blocking cookies in your browser leaves the entire course readable — only the
            assistant stops working, because it cannot tell one conversation from another
            without its session cookie.
          </p>
        </section>

        <div className={styles.contact}>
          <p>
            More detail on what is stored server-side and for how long is in the{" "}
            <Link to="/privacy">privacy policy</Link>. See also the{" "}
            <Link to="/terms">terms of service</Link>.
          </p>
        </div>
      </main>
    </Layout>
  );
}
