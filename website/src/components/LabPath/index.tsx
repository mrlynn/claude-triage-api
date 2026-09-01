import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import { Clock, Unlock } from "lucide-react";
import { LAB_PATH, ALL_LABS, labHref, totalTime, type Lab } from "@site/src/data/labs";
import styles from "./styles.module.css";

/**
 * The labs index as a path rather than a card grid.
 *
 * WHY NOT DocCardList: the default grid renders eleven equal tiles whose only
 * description is the first line of each lab, which here is the Time and
 * Prerequisites line. Every card read "Time Lab 1". Worse, a grid says the
 * eleven items are interchangeable, and they are the opposite of that — the
 * whole design of this course is that each lab introduces one idea and the
 * next one depends on it. A single rail with numbered nodes and a "builds on"
 * line under each is the sequence, drawn.
 *
 * Rendered by src/theme/DocCardList, which hands the labs category to this
 * component and everything else to the stock grid.
 */

function joinNumbers(numbers: number[]): string {
  if (numbers.length === 1) {
    return `Lab ${numbers[0]}`;
  }
  const head = numbers.slice(0, -1).join(", ");
  return `Labs ${head} and ${numbers[numbers.length - 1]}`;
}

function prerequisite(lab: Lab): string | null {
  if (lab.requires.length > 0) {
    return `Builds on ${joinNumbers(lab.requires)}`;
  }
  return lab.requiresText ?? null;
}

function Step({ lab }: { lab: Lab }): ReactNode {
  const needs = prerequisite(lab);
  return (
    <li className={styles.step}>
      <Link className={styles.card} to={labHref(lab)}>
        <span className={styles.node} aria-hidden="true">
          {lab.n}
        </span>
        <span className={styles.body}>
          <span className={styles.title}>
            <span className={styles.stepLabel}>Lab {lab.n}</span>
            {lab.title}
          </span>
          <span className={styles.tagline}>{lab.tagline}</span>
          <span className={styles.meta}>
            <span className={styles.time}>
              <Clock size={13} strokeWidth={2} aria-hidden="true" />
              {lab.minutes} min
            </span>
            <code className={styles.tag}>{lab.tag}</code>
            {needs ? <span className={styles.needs}>{needs}</span> : null}
            {lab.noKey ? (
              <span className={styles.nokey}>
                <Unlock size={12} strokeWidth={2} aria-hidden="true" />
                No API key
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function LabPath(): ReactNode {
  const first = ALL_LABS[0];
  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Labs</dt>
            <dd>{ALL_LABS.length}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Total time</dt>
            <dd>{totalTime()}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Routes built</dt>
            <dd>4</dd>
          </div>
        </dl>
        <Link className={styles.cta} to={labHref(first)}>
          Start with Lab {first.n}
        </Link>
      </div>

      <div className={styles.track}>
        {LAB_PATH.map((phase) => (
          <section className={styles.phase} key={phase.label}>
            <header className={styles.phaseHead}>
              <h2 className={styles.phaseLabel}>{phase.label}</h2>
              <p className={styles.phaseBlurb}>{phase.blurb}</p>
            </header>
            <ol className={styles.steps}>
              {phase.labs.map((lab) => (
                <Step lab={lab} key={lab.slug} />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
