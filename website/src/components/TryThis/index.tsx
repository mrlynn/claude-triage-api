import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import TicketQueue from "@site/src/components/TicketQueue";
import TraceStepper from "@site/src/components/TraceStepper";
import CacheInspector from "@site/src/components/CacheInspector";
import InjectionLab from "@site/src/components/InjectionLab";
import CostExplorer from "@site/src/components/CostExplorer";
import ModelMatrix from "@site/src/components/ModelMatrix";
import BatchPlanner from "@site/src/components/BatchPlanner";
import StreamDemo from "@site/src/components/StreamDemo";
import styles from "./styles.module.css";

/**
 * Inline playground embed for lab pages.
 *
 * Authored as a ```try JSON fence in the markdown; see plugins/remark-try.mjs.
 * Keeps the interactive tool next to the moment it teaches, instead of only
 * linking out to /playground/*.
 */

export type TryTool =
  | "queue"
  | "trace"
  | "cache"
  | "injection"
  | "cost"
  | "models"
  | "batch"
  | "stream";

export type TryThisConfig = {
  tool: TryTool;
  title: string;
  lead?: string;
  /** Full playground route; omit for lab-only tools like stream. */
  href?: string | null;
};

const DEFAULT_HREF: Partial<Record<TryTool, string>> = {
  queue: "/playground/queue",
  trace: "/playground/trace",
  cache: "/playground/cache",
  injection: "/playground/injection",
  cost: "/playground/cost",
  models: "/playground/models",
  batch: "/playground/batch",
};

const TOOL: Record<TryTool, () => ReactNode> = {
  queue: () => <TicketQueue />,
  trace: () => <TraceStepper />,
  cache: () => <CacheInspector />,
  injection: () => <InjectionLab />,
  cost: () => <CostExplorer />,
  models: () => <ModelMatrix />,
  batch: () => <BatchPlanner />,
  stream: () => <StreamDemo />,
};

type Props = { config: TryThisConfig };

export default function TryThis({ config }: Props): ReactNode {
  const href =
    config.href === null
      ? undefined
      : (config.href ?? DEFAULT_HREF[config.tool]);
  const render = TOOL[config.tool];

  return (
    <aside className={`nw-try-this ${styles.wrap}`} aria-label={config.title}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Try this</p>
        <h3 className={styles.title}>{config.title}</h3>
        {config.lead ? <p className={styles.lead}>{config.lead}</p> : null}
      </header>
      <div className={styles.body}>{render()}</div>
      {href ? (
        <footer className={styles.footer}>
          <Link to={href}>Open full playground →</Link>
        </footer>
      ) : null}
    </aside>
  );
}
