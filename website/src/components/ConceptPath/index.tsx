import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import styles from "./styles.module.css";

/**
 * Clickable capability map — the concept-map diagram as navigation.
 *
 * Authored as a ```path JSON fence; see plugins/remark-path.mjs.
 */

export type PathItem = {
  label: string;
  detail: string;
  to: string;
  param?: string;
};

type Props = { items: PathItem[] };

export default function ConceptPath({ items }: Props): ReactNode {
  return (
    <nav className={`nw-concept-path ${styles.wrap}`} aria-label="Capability path">
      <p className={styles.eyebrow}>Jump to the lab that owns each parameter</p>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.to}>
            <Link className={styles.card} to={item.to}>
              <span className={styles.label}>{item.label}</span>
              {item.param ? (
                <code className={styles.param}>{item.param}</code>
              ) : null}
              <span className={styles.detail}>{item.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
