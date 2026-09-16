import { useEffect, useState, type ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import { storefrontApi } from "@site/src/urls";

import styles from "./legal.module.css";

/**
 * How the free credit and bring-your-own-key work, for the person looking at
 * the meter in the corner and wondering why it is there.
 *
 * The worst-case figures are read from the storefront at runtime, not typed in
 * here: they follow the model's token limits, which change as the Tutor does,
 * and a page explaining a meter should not disagree with the meter.
 */

interface Account {
  mode: "off" | "anon" | "trial" | "exhausted" | "byok";
  enforced: boolean;
  signedIn: boolean;
  trial: { grantUsd: number; spentUsd: number; remainingUsd: number } | null;
  key: { last4: string } | null;
  estimates: Record<string, number>;
  signInPath: string;
}

const SURFACES: { id: string; label: string; typical: string }[] = [
  { id: "live", label: "Live preview (as you type)", typical: "under a cent" },
  { id: "classify", label: "Classify a support ticket", typical: "2–3 cents" },
  { id: "tutor_plan", label: "Tutor: build a plan", typical: "about 3 cents" },
  { id: "tutor_hint", label: "Tutor: a hint", typical: "about 2 cents" },
  { id: "tutor_review", label: "Tutor: review your attempt", typical: "about 4 cents" },
  { id: "tutor_lesson", label: "Tutor: prepare a lesson", typical: "5–10 cents" },
  { id: "assistant_turn", label: "Ask Northwind: one question", typical: "5–15 cents" },
];

const usd = (n: number) => (n < 0.1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);

function useAccount(): Account | null {
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    void fetch(`${storefrontApi()}/api/account`, { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Account>) : null))
      .then(setAccount)
      .catch(() => undefined);
  }, []);
  return account;
}

function YourStatus({ account }: { account: Account | null }): ReactNode {
  if (!account || account.mode === "off") return null;

  const signIn = () => {
    window.location.href = `${storefrontApi()}${account.signInPath}?returnTo=${encodeURIComponent(window.location.href)}`;
  };

  let text: ReactNode;
  if (account.mode === "anon") {
    text = (
      <>
        You are not signed in.{" "}
        <button type="button" className="button button--primary button--sm" onClick={signIn}>
          Sign in with GitHub
        </button>
      </>
    );
  } else if (account.mode === "byok" && account.key) {
    text = <>You are using your own Anthropic key, ending ••••{account.key.last4}.</>;
  } else if (account.trial) {
    text = (
      <>
        You have <strong>{usd(account.trial.remainingUsd)}</strong> of {usd(account.trial.grantUsd)} free credit left.
        {account.mode === "exhausted" ? " Add your own key from the meter in the corner to keep going." : ""}
      </>
    );
  }
  return <p className={styles.updated}>{text}</p>;
}

export default function Credit(): ReactNode {
  const account = useAccount();
  const estimates = account?.estimates;

  return (
    <Layout
      title="Free credit and your own API key"
      description="Why the AI features on this course ask you to sign in, what the $2 of free credit covers, and how bringing your own Anthropic key works."
    >
      <main className={`container ${styles.page}`}>
        <p className={styles.eyebrow}>How it works</p>
        <h1>Free credit, and your own key</h1>
        <p className={styles.lead}>
          The Tutor, Ask Northwind and the demos on the Northwind storefront call the real Claude API, and every call
          costs real money. To keep them free to try, and possible to keep running, each learner gets <strong>$2 of
          credit</strong> when they sign in with GitHub. When it runs out, you can keep going with your own Anthropic
          API key.
        </p>
        <YourStatus account={account} />

        <section>
          <h2>Why sign in at all</h2>
          <p>
            Reading the course needs no account, and it never will. Signing in is only for the parts that spend money
            on every click.
          </p>
          <p>
            Before sign-in existed, those features ran on one shared key with a limit per internet connection. That
            limit could not tell one person from a script, or a workshop of thirty people behind one conference Wi-Fi
            from one person refreshing a page. Credit per person fixes both: you get your own allowance, and nobody
            else can use it up.
          </p>
          <p>
            GitHub is the sign-in because almost everyone taking a course about an API already has an account, and
            because it can prove an account is not brand new, which is what keeps the free credit from being claimed
            over and over.
          </p>
        </section>

        <section>
          <h2>What signing in shares</h2>
          <ul>
            <li>
              <strong>No permissions.</strong> The site asks GitHub for no access at all: not your repositories, not
              your email, not your organizations.
            </li>
            <li>
              <strong>Three facts are kept:</strong> your GitHub user id, your username, and when your account was
              created. Against those, the site stores how much credit you were given and how much you have used, in
              dollars. It does not store what you asked.
            </li>
            <li>
              You stay signed in for up to 7 days. The record of your credit is deleted 180 days after you were last
              active.
            </li>
          </ul>
          <p>
            The full detail is in the <Link to="/privacy">privacy policy</Link> and the{" "}
            <Link to="/cookies">cookie policy</Link>.
          </p>
        </section>

        <section>
          <h2>What $2 buys</h2>
          <p>
            Enough to work through a few Tutor sessions and try every demo, which is what it is for: deciding whether
            the course is worth your time. The labs themselves run on your own machine with your own key, about $4 in
            API calls over two days, so a learner going all the way will have a key anyway.
          </p>
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>What you do</th>
                  <th>Usually about</th>
                  <th>Most it could cost</th>
                </tr>
              </thead>
              <tbody>
                {SURFACES.map((s) => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td>{s.typical}</td>
                    <td>{estimates?.[s.id] !== undefined ? usd(estimates[s.id]!) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            The middle column is a rough guide, not a quote: real costs vary with how much you write and how warm the
            cache is. The right-hand column is exact, and it is what the meter sets aside. Typical costs are low because
            the course material is cached: after the first request, Claude reads most of each prompt at a tenth of the
            normal price. That is prompt caching, and{" "}
            <Link to="/docs/labs/lab-5-prompt-caching">Lab 5</Link> is about exactly this.
          </p>
        </section>

        <section>
          <h2>How the meter counts</h2>
          <p>
            Nobody knows what a call costs until it has finished, and by then it has been spent. So before each call,
            the meter sets aside the <em>most</em> that call could possibly cost — the right-hand column above — and
            only runs it if that fits in what you have left. When the answer arrives, everything it did not use goes
            straight back.
          </p>
          <p>This has two consequences worth knowing:</p>
          <ul>
            <li>
              <strong>You are never cut off halfway through an answer.</strong> If a call starts, your credit already
              covered its worst case.
            </li>
            <li>
              <strong>A call can be refused while you still have some credit.</strong> With $0.30 left, a Tutor lesson
              might not fit even though it would probably have cost a few cents. Cheaper features, like the live
              preview, keep working.
            </li>
          </ul>
          <p>
            There is also a limit on free credit across everyone per day, so a busy day can pause it for everybody
            until midnight UTC. Your own key is never affected by that.
          </p>
        </section>

        <section>
          <h2>Bringing your own Anthropic key</h2>
          <p>
            When your credit runs out, or any time before, open the meter in the corner of any page and choose{" "}
            <strong>Use your own Anthropic key</strong>. From then on your requests run on your key, with no limit
            from this site.
          </p>
          <p>There are good reasons to do it even before the $2 is gone:</p>
          <ul>
            <li>
              <strong>You need one for the labs anyway.</strong> The labs run on your own machine and call the API with
              your key.
            </li>
            <li>
              <strong>No worst-case reservation.</strong> Nothing is refused for credit; you pay what a call actually
              costs, directly to Anthropic.
            </li>
            <li>
              <strong>You see the real bill.</strong> Your spend shows up in the Anthropic Console, which is a useful
              thing to watch while learning an API that charges per token.
            </li>
          </ul>

          <h3>Getting a key the safe way</h3>
          <ol>
            <li>
              Sign in at <a href="https://console.anthropic.com">console.anthropic.com</a> and add a small amount of
              credit.
            </li>
            <li>
              Create a key under <a href="https://console.anthropic.com/settings/keys">Settings → API keys</a> just for
              this course, and give it a name you will recognise, such as &ldquo;triage course&rdquo;. A key used only
              here can be disabled without breaking anything else you run.
            </li>
            <li>
              Set a monthly spend limit for your organization in the Console. Anthropic does not offer limits per key,
              so the organization limit is the ceiling on what any key of yours can cost.
            </li>
            <li>Paste the key into the meter. It is checked with Anthropic, at no cost, before it is saved.</li>
          </ol>
        </section>

        <section>
          <h2 id="is-my-key-safe">Is my key safe?</h2>
          <p>
            <strong>The short answer: with a spend limit set, the most it could ever cost you is that limit, and you can
            switch the key off yourself in seconds.</strong> Disabling a key in the Anthropic Console stops it everywhere at once, no matter
            what any website has stored. Everything below is how this site keeps you from needing to.
          </p>

          <h3>What protects it</h3>
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  <th>If this happened</th>
                  <th>Your key is protected because</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Someone got a copy of the database</td>
                  <td>
                    Keys are stored encrypted, and the encryption key is not in the database. A copy of the data alone
                    does not reveal a key.
                  </td>
                </tr>
                <tr>
                  <td>Another learner, or another of your own sign-ins, tried to use it</td>
                  <td>
                    Each key is locked to the sign-in it was entered in. Moved anywhere else, it does not decrypt.
                  </td>
                </tr>
                <tr>
                  <td>A malicious script ran on the page</td>
                  <td>
                    The key is never sent back to the browser. After you save it, the page only ever receives its last
                    four characters, so there is nothing on the page to steal.
                  </td>
                </tr>
                <tr>
                  <td>An error was logged</td>
                  <td>
                    Anything shaped like an API key is removed from error messages before they are logged, and keys are
                    never put in URLs.
                  </td>
                </tr>
                <tr>
                  <td>Anthropic rejected the key</td>
                  <td>
                    It is deleted, and you are told. The site does not switch to its own key and carry on, so it is
                    always clear whose account a request was billed to.
                  </td>
                </tr>
                <tr>
                  <td>You forgot about it</td>
                  <td>
                    It deletes itself after 24 hours without use, and immediately when you press Remove key or sign out.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>This site itself was compromised</strong>
                  </td>
                  <td>
                    <strong>This one cannot be ruled out.</strong> Whoever runs the site holds the encryption key, so
                    an attacker with full control of the server could use keys stored or entered while they had it. That is exactly why
                    the steps above say to use a key made just for this course, with a spend limit: the damage is capped,
                    and the fix is one click in the Console.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            For the technically curious: keys are encrypted with AES-256-GCM, with your session as authenticated data,
            which is what makes a copied key useless elsewhere. The API key itself only ever travels over HTTPS.
          </p>

          <h3>Don&rsquo;t take our word for it</h3>
          <p>The course is open source, so every claim on this page can be checked against the code that does it:</p>
          <ul>
            <li>
              <a href="https://github.com/mrlynn/claude-triage-api/blob/main/storefront/lib/secrets.ts">
                <code>storefront/lib/secrets.ts</code>
              </a>{" "}
              — encryption, and the redaction of keys from logs
            </li>
            <li>
              <a href="https://github.com/mrlynn/claude-triage-api/blob/main/storefront/lib/funding.ts">
                <code>storefront/lib/funding.ts</code>
              </a>{" "}
              — how each request decides whose key pays, and what happens when your key is rejected
            </li>
            <li>
              <a href="https://github.com/mrlynn/claude-triage-api/blob/main/storefront/app/api/account/key/route.ts">
                <code>storefront/app/api/account/key/route.ts</code>
              </a>{" "}
              — adding and removing a key, and what the response sends back
            </li>
            <li>
              <a href="https://github.com/mrlynn/claude-triage-api/blob/main/storefront/scripts/byok.integration.mts">
                <code>storefront/scripts/byok.integration.mts</code>
              </a>{" "}
              — tests for each of the above, including that a rejected key is never swapped for the site&rsquo;s own
            </li>
          </ul>

          <h3>Prefer your key never leaves your machine?</h3>
          <p>
            Then don&rsquo;t paste it here. The whole course — the Tutor, Ask Northwind and the storefront demos — runs
            on your own computer with <code>npm run dev:all</code>, using a key in <code>storefront/.env.local</code>.
            Locally there is no sign-in and no credit, and your key goes only to Anthropic. The{" "}
            <Link to="/docs/setup">setup guide</Link> covers the first steps.
          </p>
        </section>

        <section>
          <h2>Common questions</h2>
          <h3>My GitHub account is new and I got no credit.</h3>
          <p>
            Accounts younger than 30 days get no free credit, and there is a limit on new grants per day. Both are what
            stop the credit being farmed with throwaway accounts. Everything else works with your own key.
          </p>
          <h3>I am in a workshop.</h3>
          <p>
            Sign in before the session starts. If your facilitator gave you an API key, paste that into the meter.
            Facilitators can also raise the credit for a whole group.
          </p>
          <h3>Can I stop using my key?</h3>
          <p>
            Yes. Open the meter and press Remove key, or sign out, and the stored copy is deleted. To be certain it can
            never be used again by anyone, disable it in the Anthropic Console as well.
          </p>
          <h3>Does signing in give the site access to anything else?</h3>
          <p>No. It decides who pays for an AI request and nothing more.</p>
        </section>

        <div className={styles.contact}>
          <p>
            Something here unclear, or a question it does not answer:{" "}
            <a href="mailto:merlynn@gmail.com">merlynn@gmail.com</a>. The design behind it is written up in the{" "}
            <a href="https://github.com/mrlynn/claude-triage-api/tree/main/docs/byok">course repository</a>.
          </p>
        </div>
      </main>
    </Layout>
  );
}
