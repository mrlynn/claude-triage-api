import { useState, type ReactNode } from "react";
import styles from "./styles.module.css";

/**
 * A knowledge check, placed inline at the moment the idea is taught.
 *
 * Two design rules, both about not wasting the learner's time:
 *
 *  1. The explanation shows on EVERY answer, right or wrong. A quiz that only
 *     explains failures teaches the people who guessed correctly nothing.
 *  2. Wrong answers are not punished or hidden. You see which one you picked,
 *     which one was right, and why. Then you move on — there is no retry
 *     scoring, because this is a check on understanding, not an exam.
 *
 * Authored as a ```quiz JSON fence in the markdown; see plugins/remark-quiz.mjs.
 */

export interface QuizItem {
  question: string;
  options: string[];
  /** Index into options. */
  answer: number;
  explain: string;
  /** Optional extra note shown under the explanation. */
  note?: string;
}

function Item({ item, index, total }: { item: QuizItem; index: number; total: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = picked === item.answer;

  return (
    <div className={styles.item}>
      <div className={styles.head}>
        <span className={styles.badge}>Check</span>
        {total > 1 && (
          <span className={styles.counter}>
            {index + 1} of {total}
          </span>
        )}
      </div>

      <p className={styles.question}>{item.question}</p>

      <div className={styles.options}>
        {item.options.map((opt, i) => {
          const isAnswer = i === item.answer;
          const isPicked = i === picked;
          const cls = !answered
            ? styles.option
            : isAnswer
              ? styles.optionCorrect
              : isPicked
                ? styles.optionWrong
                : styles.optionMuted;
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={answered}
              onClick={() => setPicked(i)}
            >
              <span className={styles.marker}>
                {answered && isAnswer ? "✓" : answered && isPicked ? "✕" : String.fromCharCode(65 + i)}
              </span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>

      {answered && (
        <div className={correct ? styles.explainRight : styles.explainWrong}>
          <p className={styles.verdict}>
            {correct ? "Right." : "Not quite."}
          </p>
          <p className={styles.explainText}>{item.explain}</p>
          {item.note && <p className={styles.note}>{item.note}</p>}
        </div>
      )}
    </div>
  );
}

export default function Quiz({ items }: { items: QuizItem[] }): ReactNode {
  return (
    <div className={styles.wrap}>
      {items.map((item, i) => (
        <Item key={item.question} item={item} index={i} total={items.length} />
      ))}
    </div>
  );
}
