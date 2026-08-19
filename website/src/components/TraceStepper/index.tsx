import { useState, type ReactNode } from "react";
import styles from "./styles.module.css";

/**
 * Steps through an agentic loop turn by turn.
 *
 * The lesson this exists for is Lab 3 Q3, which learners reliably get wrong:
 * an agentic loop resends the entire conversation on every turn, so input
 * tokens grow with each iteration and the LAST turn is the most expensive one.
 * Reporting only the final message's usage therefore under-reports total spend
 * badly — and by a factor that is not 1/N, which is the part that surprises
 * people.
 *
 * Token counts are representative of a real 3-turn run of /v1/resolve. Exact
 * figures move per ticket; the shape is the point.
 */

const IN_RATE = 5 / 1_000_000;
const OUT_RATE = 25 / 1_000_000;
const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;
const PREFIX = 4711;

type Block = { kind: "system" | "user" | "assistant" | "tool_result"; label: string };

type Turn = {
  n: number;
  headline: string;
  narrative: string;
  /** Everything in `messages` when this request goes out. */
  context: Block[];
  toolCalls: { name: string; input: string; result: string }[];
  finalAnswer?: string;
  usage: {
    cacheWrite: number;
    cacheRead: number;
    freshInput: number;
    output: number;
  };
};

const TURNS: Turn[] = [
  {
    n: 1,
    headline: "Claude asks who and what",
    narrative:
      "First request. The prefix is written to cache. Claude has the ticket and nothing else, so it reaches for the two lookups it needs before it can reason about anything: the order, and the account standing. Both go out in one turn, in parallel.",
    context: [
      { kind: "system", label: "system: role + policy handbook (cached prefix)" },
      { kind: "user", label: "user: the customer ticket" },
    ],
    toolCalls: [
      {
        name: "lookup_order",
        input: '{ "order_id": "NW-48211" }',
        result: '{ "found": true, "total_usd": 218.4, "days_since_delivery": 16, … }',
      },
      {
        name: "lookup_customer",
        input: '{ "email": "dana.k@example.com" }',
        result: '{ "found": true, "member_tier": "trail_club", "refunds_last_30d_usd": 0, … }',
      },
    ],
    usage: { cacheWrite: PREFIX, cacheRead: 0, freshInput: 68, output: 124 },
  },
  {
    n: 2,
    headline: "Now it checks the rules",
    narrative:
      "The prefix is warm. But the context has grown: the assistant turn and both tool results are now part of every subsequent request. Knowing the jacket is a 16-day-old defect on a $218 order, Claude searches policy for the clauses that actually govern the decision.",
    context: [
      { kind: "system", label: "system: role + policy handbook (cached prefix)" },
      { kind: "user", label: "user: the customer ticket" },
      { kind: "assistant", label: "assistant: 2 tool_use blocks" },
      { kind: "tool_result", label: "tool_result: order NW-48211" },
      { kind: "tool_result", label: "tool_result: customer dana.k" },
    ],
    toolCalls: [
      {
        name: "search_policy",
        input: '{ "query": "defective item replacement window" }',
        result: "§2.2 lifetime workmanship guarantee, §2.4 store credit never required…",
      },
      {
        name: "search_policy",
        input: '{ "query": "return shipping defective who pays" }',
        result: "§2.5 return shipping free for defective items…",
      },
    ],
    usage: { cacheWrite: 0, cacheRead: PREFIX, freshInput: 742, output: 96 },
  },
  {
    n: 3,
    headline: "It answers, and this turn costs the most",
    narrative:
      "Everything from turns 1 and 2 is still in the request, plus two more tool results. This is the largest input of the run and it produces the final structured answer. Notice that fresh input has grown roughly 28x since turn 1 while the cached prefix has not moved.",
    context: [
      { kind: "system", label: "system: role + policy handbook (cached prefix)" },
      { kind: "user", label: "user: the customer ticket" },
      { kind: "assistant", label: "assistant: 2 tool_use blocks" },
      { kind: "tool_result", label: "tool_result: order NW-48211" },
      { kind: "tool_result", label: "tool_result: customer dana.k" },
      { kind: "assistant", label: "assistant: 2 tool_use blocks" },
      { kind: "tool_result", label: "tool_result: policy §2.2, §2.4" },
      { kind: "tool_result", label: "tool_result: policy §2.5" },
    ],
    toolCalls: [],
    finalAnswer: `{
  "recommended_action": "ship_replacement",
  "policy_citations": ["2.2", "2.4", "2.5", "6.3"],
  "refund_amount_usd": null,
  "within_agent_authority": true,
  "reasoning": "Order NW-48211 is verified…"
}`,
    usage: { cacheWrite: 0, cacheRead: PREFIX, freshInput: 1893, output: 247 },
  },
];

function turnCost(t: Turn): number {
  return (
    t.usage.cacheWrite * IN_RATE * CACHE_WRITE +
    t.usage.cacheRead * IN_RATE * CACHE_READ +
    t.usage.freshInput * IN_RATE +
    t.usage.output * OUT_RATE
  );
}

const TOTAL = TURNS.reduce((a, t) => a + turnCost(t), 0);
const LAST_ONLY = turnCost(TURNS[TURNS.length - 1]);

function usd(n: number) {
  return `$${n.toFixed(4)}`;
}

export default function TraceStepper(): ReactNode {
  const [i, setI] = useState(0);
  const turn = TURNS[i];
  const runningTotal = TURNS.slice(0, i + 1).reduce((a, t) => a + turnCost(t), 0);
  const maxFresh = Math.max(...TURNS.map((t) => t.usage.freshInput));

  return (
    <div className={styles.wrap}>
      <div className={styles.steps}>
        {TURNS.map((t, idx) => (
          <button
            key={t.n}
            type="button"
            className={idx === i ? styles.stepActive : styles.step}
            onClick={() => setI(idx)}
          >
            <span className={styles.stepNum}>{t.n}</span>
            <span className={styles.stepLabel}>{t.headline}</span>
          </button>
        ))}
      </div>

      <p className={styles.narrative}>{turn.narrative}</p>

      <div className={styles.panes}>
        <div className={styles.pane}>
          <div className={styles.paneHeader}>
            messages sent this turn ({turn.context.length} blocks)
          </div>
          <ul className={styles.stack}>
            {turn.context.map((b, idx) => {
              const isNew = idx >= (TURNS[i - 1]?.context.length ?? 0);
              return (
                <li
                  key={`${b.label}-${idx}`}
                  className={`${styles[b.kind]} ${isNew ? styles.isNew : ""}`}
                >
                  {b.label}
                  {isNew && i > 0 && <span className={styles.newTag}>new</span>}
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.pane}>
          <div className={styles.paneHeader}>
            {turn.toolCalls.length > 0 ? "tools called" : "final answer"}
          </div>
          {turn.toolCalls.length > 0 ? (
            <div className={styles.tools}>
              {turn.toolCalls.map((c) => (
                <div key={c.name + c.input} className={styles.tool}>
                  <code className={styles.toolName}>{c.name}</code>
                  <div className={styles.toolInput}>{c.input}</div>
                  <div className={styles.toolResult}>{c.result}</div>
                </div>
              ))}
            </div>
          ) : (
            <pre className={styles.answer}>
              <code>{turn.finalAnswer}</code>
            </pre>
          )}

          <div className={styles.paneHeader} style={{ marginTop: "1rem" }}>
            usage this turn
          </div>
          <table className={styles.usage}>
            <tbody>
              <tr>
                <td>cache_creation_input_tokens</td>
                <td>{turn.usage.cacheWrite.toLocaleString()}</td>
              </tr>
              <tr>
                <td>cache_read_input_tokens</td>
                <td>{turn.usage.cacheRead.toLocaleString()}</td>
              </tr>
              <tr className={styles.growRow}>
                <td>input_tokens (fresh)</td>
                <td>
                  {turn.usage.freshInput.toLocaleString()}
                  <span
                    className={styles.growBar}
                    style={{
                      width: `${(turn.usage.freshInput / maxFresh) * 100}%`,
                    }}
                  />
                </td>
              </tr>
              <tr>
                <td>output_tokens</td>
                <td>{turn.usage.output.toLocaleString()}</td>
              </tr>
              <tr className={styles.costRow}>
                <td>cost this turn</td>
                <td>{usd(turnCost(turn))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.tally}>
        <div className={styles.tallyItem}>
          <span className={styles.tallyLabel}>Running total after turn {turn.n}</span>
          <span className={styles.tallyValue}>{usd(runningTotal)}</span>
        </div>
        <div className={styles.tallyItem}>
          <span className={styles.tallyLabel}>True total, all 3 turns</span>
          <span className={styles.tallyValue}>{usd(TOTAL)}</span>
        </div>
        <div className={styles.tallyItem}>
          <span className={styles.tallyLabel}>If you logged only the final message</span>
          <span className={styles.tallyValueBad}>{usd(LAST_ONLY)}</span>
        </div>
      </div>

      <p className={styles.punchline}>
        The final message&rsquo;s <code>usage</code> describes only the final
        request. Log that and you report <strong>{usd(LAST_ONLY)}</strong> for a
        run that actually cost <strong>{usd(TOTAL)}</strong>, an under-report of{" "}
        <strong>{(TOTAL / LAST_ONLY).toFixed(1)}x</strong>. And the error is not{" "}
        <code>1/N</code>, because the turns are not equal — history accumulates,
        so the last turn is the largest one. Sum every turn.
      </p>
    </div>
  );
}
