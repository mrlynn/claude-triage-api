import { useState, type ReactNode } from "react";
import styles from "./styles.module.css";

/**
 * "Spot the cache bug."
 *
 * Four variants of the same request. One caches. Three do not, and every one
 * of the three succeeds with HTTP 200 and a correct answer, which is exactly
 * what makes caching bugs so expensive: there is no error to notice.
 *
 * The learner picks a variant and sees the usage block that would come back on
 * the SECOND identical call. The tell is always the same single field.
 */

const PREFIX_TOKENS = 3358;
const VARIABLE_TOKENS = 112;
const OUTPUT_TOKENS = 134;
const IN_RATE = 5 / 1_000_000;
const OUT_RATE = 25 / 1_000_000;

type Variant = {
  id: string;
  label: string;
  code: string;
  caches: boolean;
  prefixTokens: number;
  why: string;
  fix: string;
};

const VARIANTS: Variant[] = [
  {
    id: "clean",
    label: "As shipped",
    caches: true,
    prefixTokens: PREFIX_TOKENS,
    code: `system: [
  {
    type: "text",
    text: \`\${ROLE}\\n\\n\${POLICY_HANDBOOK}\`,
    cache_control: { type: "ephemeral" },
  },
  { type: "text", text: volatileContext(opts) },
]`,
    why: "The frozen block is byte-identical on every request, the breakpoint sits on it, and everything that varies comes after.",
    fix: "Nothing to fix. This is the shape you want.",
  },
  {
    id: "timestamp",
    label: "Timestamp in the prefix",
    caches: false,
    prefixTokens: PREFIX_TOKENS,
    code: `system: [
  {
    type: "text",
    text: \`Today is \${new Date().toISOString()}
\${ROLE}\\n\\n\${POLICY_HANDBOOK}\`,
    cache_control: { type: "ephemeral" },
  },
]`,
    why: "The prefix differs on every single request, so nothing is ever reusable. This is the most common cache bug in production because it looks like a helpful change.",
    fix: "Move the date into a second block, after the breakpoint.",
  },
  {
    id: "breakpoint",
    label: "Breakpoint on the wrong block",
    caches: false,
    prefixTokens: PREFIX_TOKENS,
    code: `system: [
  { type: "text", text: \`\${ROLE}\\n\\n\${POLICY_HANDBOOK}\` },
  {
    type: "text",
    text: volatileContext(opts),
    cache_control: { type: "ephemeral" },
  },
]`,
    why: "The cached prefix now includes the volatile block, so it never matches. The handbook is in the prefix but the prefix changes every time.",
    fix: "Put cache_control on the frozen block, not the last one.",
  },
  {
    id: "short",
    label: "Prefix under the minimum",
    caches: false,
    prefixTokens: 110,
    code: `system: [
  {
    type: "text",
    text: POLICY_HANDBOOK.slice(0, 400),
    cache_control: { type: "ephemeral" },
  },
]`,
    why: "Roughly 110 tokens, under the 512-token minimum Opus 5 applies. The API silently declines to cache. No error, no warning, no header. Note that ROLE had to go too: the role text alone is ~554 tokens and would clear the minimum on its own. Note also that the minimum is per model — Sonnet 5 needs 1024 and Haiku 4.5 needs 4096, so the same prefix can cache on one tier and not another.",
    fix: "Cache a larger prefix, or accept that this one will not cache — and check the minimum for the model you actually ship, not the one you developed against.",
  },
];

function usd(n: number) {
  return `$${n.toFixed(5)}`;
}

function usageFor(v: Variant) {
  // On a cache hit the prefix is billed at 0.1x and leaves input_tokens small.
  // On a miss the whole prefix lands in input_tokens at full rate.
  const cacheRead = v.caches ? v.prefixTokens : 0;
  const freshInput = v.caches
    ? VARIABLE_TOKENS
    : v.prefixTokens + VARIABLE_TOKENS;
  const cost =
    freshInput * IN_RATE + cacheRead * IN_RATE * 0.1 + OUTPUT_TOKENS * OUT_RATE;
  return { cacheRead, freshInput, cost };
}

export default function CacheInspector(): ReactNode {
  const [selected, setSelected] = useState(VARIANTS[0]);
  const [revealed, setRevealed] = useState(false);
  const usage = usageFor(selected);
  const baseline = usageFor(VARIANTS[0]);
  const multiple = usage.cost / baseline.cost;

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs} role="tablist">
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={selected.id === v.id}
            className={selected.id === v.id ? styles.tabActive : styles.tab}
            onClick={() => {
              setSelected(v);
              setRevealed(false);
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        <div className={styles.codeCol}>
          <div className={styles.colHeader}>src/prompts.ts</div>
          <pre className={styles.code}>
            <code>{selected.code}</code>
          </pre>
        </div>

        <div className={styles.resultCol}>
          <div className={styles.colHeader}>
            usage on the 2nd identical call
          </div>

          {!revealed ? (
            <div className={styles.guess}>
              <p className={styles.guessPrompt}>
                Does this cache? Every variant returns HTTP 200 with a correct
                answer, so the response body will not tell you.
              </p>
              <button
                type="button"
                className={styles.revealBtn}
                onClick={() => setRevealed(true)}
              >
                Show the usage block
              </button>
            </div>
          ) : (
            <>
              <pre className={styles.usage}>
                <code>{`{
  "input_tokens": ${usage.freshInput},
  "cache_creation_input_tokens": 0,
  "cache_read_input_tokens": ${usage.cacheRead},
  "output_tokens": ${OUTPUT_TOKENS}
}`}</code>
              </pre>

              <div
                className={selected.caches ? styles.verdictGood : styles.verdictBad}
              >
                {selected.caches ? (
                  <>
                    <strong>Cache hit.</strong> {usd(usage.cost)} per request.
                  </>
                ) : (
                  <>
                    <strong>Cache miss.</strong> {usd(usage.cost)} per request,{" "}
                    {multiple.toFixed(1)}x the cost of the working version. No
                    error was raised.
                  </>
                )}
              </div>

              <p className={styles.why}>{selected.why}</p>
              <p className={styles.fix}>
                <strong>Fix:</strong> {selected.fix}
              </p>
            </>
          )}
        </div>
      </div>

      <p className={styles.footnote}>
        The only field that distinguishes these four is{" "}
        <code>cache_read_input_tokens</code>. That is why it is the thing to
        alert on, and why a caching change cannot be validated by reading the
        diff.
      </p>
    </div>
  );
}
