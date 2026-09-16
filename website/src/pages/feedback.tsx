import { useState, type ReactNode } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { FeedbackError, MAX_COMMENT_CHARS, sendFeedback, type Category } from "@site/src/components/Feedback/api";
import thumbStyles from "@site/src/components/Feedback/styles.module.css";
import styles from "./legal.module.css";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "Something is broken" },
  { value: "content", label: "A lab or page is wrong or unclear" },
  { value: "idea", label: "An idea or request" },
  { value: "praise", label: "Something worked well" },
  { value: "other", label: "Something else" },
];

/**
 * Feedback that is not about one paragraph: a bug, a request, a lab that did
 * not work end to end. Page-level and Tutor feedback have their own inline
 * controls; this is for everything those cannot hold. It goes to the course
 * owner's inbox, not to a public thread — questions for other learners belong
 * in GitHub Discussions.
 */
export default function Feedback(): ReactNode {
  const { baseUrl } = useDocusaurusContext().siteConfig;
  const [category, setCategory] = useState<Category | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await sendFeedback({ baseUrl, surface: "general", category, comment: comment.trim() });
      setSent(true);
    } catch (e) {
      setError(e instanceof FeedbackError ? e.message : "Feedback could not be sent.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout title="Send feedback" description="Tell the course owner what is broken, unclear, or working well.">
      <main className={`container ${styles.page}`}>
        <p className={styles.eyebrow}>Feedback</p>
        <h1>Send feedback</h1>
        <p className={styles.lead}>
          Found a bug, a lab that does not work, or something that finally made caching click? This goes straight to the
          person who maintains the course. If you want an answer from other learners, ask in{" "}
          <a href="https://github.com/mrlynn/claude-triage-api/discussions">GitHub Discussions</a> instead.
        </p>

        {sent ? (
          <section>
            <p>
              <strong>Thanks — it&rsquo;s been sent.</strong> There is no reply address, so if you need a response, open a
              discussion on GitHub.
            </p>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setSent(false);
                setComment("");
                setCategory(null);
              }}
            >
              Send more
            </button>
          </section>
        ) : (
          <section>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <fieldset style={{ border: 0, padding: 0, margin: "0 0 1rem" }}>
                <legend style={{ fontWeight: 600, marginBottom: "0.5rem" }}>What is it about?</legend>
                <div className={thumbStyles.reasons}>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={category === c.value ? thumbStyles.chipOn : thumbStyles.chip}
                      aria-pressed={category === c.value}
                      onClick={() => setCategory(category === c.value ? null : c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label htmlFor="feedback-comment" style={{ fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>
                Tell us more
              </label>
              <textarea
                id="feedback-comment"
                className={thumbStyles.comment}
                rows={7}
                maxLength={MAX_COMMENT_CHARS}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Which lab or page, what you did, what happened, what you expected."
                required
              />
              <p className={thumbStyles.fine}>
                {comment.length}/{MAX_COMMENT_CHARS}. Please don&rsquo;t include personal details or API keys; emails, phone
                numbers and keys are removed before it is stored. If you are signed in with GitHub, your username is attached.
                Kept for 90 days — see the <Link to="/privacy">privacy policy</Link>.
              </p>
              {error && <p className={thumbStyles.error}>{error}</p>}
              <button
                type="submit"
                className="button button--primary"
                style={{ marginTop: "1rem" }}
                disabled={sending || comment.trim().length === 0}
              >
                {sending ? "Sending…" : "Send feedback"}
              </button>
            </form>
          </section>
        )}
      </main>
    </Layout>
  );
}
