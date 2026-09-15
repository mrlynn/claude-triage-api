import { useEffect, useState } from "react";
import quiz from "../Quiz/styles.module.css";
import styles from "./styles.module.css";
import type { DrillItem } from "./types";

/**
 * Rapid-fire recall. One question at a time, answerable from the keyboard
 * (1–4 to pick, Enter for next), because on a clock the mouse is friction.
 *
 * It keeps the course Quiz's rule: the explanation shows on EVERY answer, right
 * or wrong. Unlike the Quiz it reports each answer, so the page can score it
 * and send misses back into the deck.
 */
export default function Drill({
  label,
  items,
  answers,
  onAnswer,
  onDone,
  doneLabel,
  docTitle,
}: {
  label: string;
  items: DrillItem[];
  answers: Record<number, number>;
  onAnswer: (index: number, picked: number) => void;
  onDone: () => void;
  doneLabel: string;
  docTitle: (id: string) => string;
}) {
  const firstOpen = items.findIndex((_, i) => answers[i] === undefined);
  const [index, setIndex] = useState(firstOpen === -1 ? Math.max(0, items.length - 1) : firstOpen);
  const item = items[index];
  const picked = answers[index];
  const answered = picked !== undefined;
  const last = index === items.length - 1;
  const right = Object.entries(answers).filter(([i, p]) => items[Number(i)]?.answer === p).length;

  const next = () => (last ? onDone() : setIndex(index + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (!item) return;
      const n = Number(e.key);
      if (!answered && n >= 1 && n <= item.options.length) onAnswer(index, n - 1);
      else if (answered && e.key === "Enter") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!item) return null;

  return (
    <div className={quiz.item}>
      <div className={quiz.head}>
        <span className={quiz.badge}>
          {label} · {docTitle(item.labId)}
          {item.source === "authored" ? " · from the lab" : ""}
        </span>
        <span className={quiz.counter}>
          {index + 1} of {items.length} · {right} right
        </span>
      </div>
      <p className={quiz.question}>{item.question}</p>
      <div className={quiz.options}>
        {item.options.map((option, i) => {
          const cls = !answered
            ? quiz.option
            : i === item.answer
              ? quiz.optionCorrect
              : i === picked
                ? quiz.optionWrong
                : quiz.optionMuted;
          return (
            <button key={i} type="button" className={cls} disabled={answered} onClick={() => onAnswer(index, i)}>
              <span className={quiz.marker}>{i + 1}</span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>
      {answered && (
        <div className={picked === item.answer ? quiz.explainRight : quiz.explainWrong}>
          <p className={quiz.verdict}>{picked === item.answer ? "Right." : "Not quite — this one comes back later."}</p>
          <p className={quiz.explainText}>{item.explain}</p>
          {item.note && <p className={quiz.note}>{item.note}</p>}
        </div>
      )}
      <div className={styles.actions}>
        {index > 0 && (
          <button type="button" className="button button--sm button--secondary" onClick={() => setIndex(index - 1)}>
            Back
          </button>
        )}
        <button type="button" className="button button--sm button--primary" disabled={!answered} onClick={next}>
          {last ? doneLabel : "Next"} <kbd className={styles.kbd}>Enter</kbd>
        </button>
      </div>
    </div>
  );
}
