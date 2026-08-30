import type { ReactNode } from "react";
import styles from "./styles.module.css";

/**
 * A static "usage receipt" for the example the learner just ran.
 *
 * Numbers are representative of a real call shape — labeled as such — so the
 * four usage fields become something you can see, not only jq.
 *
 * Authored as a ```receipt JSON fence; see plugins/remark-receipt.mjs.
 */

export type ReceiptConfig = {
  title?: string;
  note?: string;
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
  /** Precomputed USD string, e.g. "$0.012". */
  cost: string;
  stopReason?: string;
};

type Props = { config: ReceiptConfig };

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.row}>
      <span className={styles.key}>{label}</span>
      <span className={styles.val}>{value}</span>
    </div>
  );
}

export default function Receipt({ config }: Props): ReactNode {
  const cacheWrite = config.cacheWrite ?? 0;
  const cacheRead = config.cacheRead ?? 0;
  return (
    <aside className={`nw-receipt ${styles.wrap}`} aria-label="Usage receipt">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Usage receipt</p>
        <h3 className={styles.title}>{config.title ?? "Representative call"}</h3>
        {config.note ? <p className={styles.note}>{config.note}</p> : null}
      </header>
      <div className={styles.grid}>
        <Row label="input_tokens" value={config.input} />
        <Row label="output_tokens" value={config.output} />
        <Row label="cache_creation_input_tokens" value={cacheWrite} />
        <Row label="cache_read_input_tokens" value={cacheRead} />
        {config.stopReason ? (
          <Row label="stop_reason" value={config.stopReason} />
        ) : null}
        <Row label="cost (list)" value={config.cost} />
      </div>
    </aside>
  );
}
