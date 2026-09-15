import { useState } from "react";
import styles from "./styles.module.css";
import { LIMITS, TOPICS, sessionCount, type Intake as IntakeInput, type Level } from "./types";

/**
 * The brief says: ask for every input before doing anything, then confirm scope
 * in one short message. So this form spends nothing. The model is not called
 * until the learner has read the one-line scope and said yes to it — and the
 * storefront enforces that number, so the plan cannot quietly grow.
 */

const DAYS = [1, 2, 3, 5, 7, 14];
const MINUTES = [15, 25, 45, 60];
const LEVELS: { id: Level; label: string; detail: string }[] = [
  { id: "new", label: "New to the API", detail: "I write code, but I have never called Claude." },
  { id: "some", label: "Made a few calls", detail: "I have sent requests, not built anything real." },
  { id: "shipped", label: "Shipped something", detail: "I want depth and production judgment." },
];

function Chips<T extends number>({
  values,
  value,
  onChange,
  format,
  name,
}: {
  values: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
  name: string;
}) {
  return (
    <div className={styles.chips} role="radiogroup" aria-label={name}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          className={v === value ? styles.chipOn : styles.chip}
          onClick={() => onChange(v)}
        >
          {format(v)}
        </button>
      ))}
    </div>
  );
}

export function scopeLine(intake: IntakeInput): string {
  const n = sessionCount(intake);
  const hours = (n * intake.minutesPerSession) / 60;
  const topics = intake.focus.length
    ? TOPICS.filter((t) => intake.focus.includes(t.id))
        .map((t) => t.id.replace("lab-", "Lab "))
        .join(", ")
    : "Labs 1–9";
  return `${n} session${n === 1 ? "" : "s"} × ${intake.minutesPerSession} min over ${intake.days} day${
    intake.days === 1 ? "" : "s"
  } (${hours % 1 ? hours.toFixed(1) : hours} h), on ${topics} of the Messages API course.`;
}

export default function Intake({
  initial,
  busy,
  error,
  onConfirm,
}: {
  initial: IntakeInput | null;
  busy: boolean;
  error: string | null;
  onConfirm: (intake: IntakeInput) => void;
}) {
  const [days, setDays] = useState(initial?.days ?? 3);
  const [sessionsPerDay, setSessionsPerDay] = useState(initial?.sessionsPerDay ?? 1);
  const [minutesPerSession, setMinutes] = useState(initial?.minutesPerSession ?? 25);
  const [level, setLevel] = useState<Level>(initial?.level ?? "some");
  const [focus, setFocus] = useState<string[]>(initial?.focus ?? []);
  const [confirming, setConfirming] = useState(false);

  const intake: IntakeInput = { days, sessionsPerDay, minutesPerSession, level, focus };
  const capped = days * sessionsPerDay > LIMITS.maxSessions;

  if (confirming) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Confirm scope</p>
        <p className={styles.scope}>{scopeLine(intake)}</p>
        {capped && (
          <p className={styles.muted}>
            Capped at {LIMITS.maxSessions} sessions — past that, a cram plan is a course, and the labs are right there.
          </p>
        )}
        <p className={styles.muted}>
          Each session: a recall warm-up, a short brief, a drill, and one exercise the Tutor reviews. Your plan and
          progress stay in this browser.
        </p>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className="button button--secondary" disabled={busy} onClick={() => setConfirming(false)}>
            Change
          </button>
          <button type="button" className="button button--primary" disabled={busy} onClick={() => onConfirm(intake)}>
            {busy ? "Building your plan and first lesson…" : "Build my plan"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Before anything is built</p>

      <fieldset className={styles.field}>
        <legend>How long do you have?</legend>
        <Chips name="Days" values={DAYS} value={days} onChange={setDays} format={(d) => (d === 1 ? "Today" : `${d} days`)} />
        <label className={styles.inline}>
          or
          <input
            type="number"
            min={1}
            max={LIMITS.maxDays}
            value={days}
            onChange={(e) => setDays(Math.min(LIMITS.maxDays, Math.max(1, Number(e.target.value) || 1)))}
          />
          days
        </label>
      </fieldset>

      <fieldset className={styles.field}>
        <legend>Sessions per day</legend>
        <Chips name="Sessions per day" values={[1, 2, 3]} value={sessionsPerDay} onChange={setSessionsPerDay} format={String} />
      </fieldset>

      <fieldset className={styles.field}>
        <legend>Minutes per session</legend>
        <Chips name="Minutes" values={MINUTES} value={minutesPerSession} onChange={setMinutes} format={(m) => `${m} min`} />
      </fieldset>

      <fieldset className={styles.field}>
        <legend>Where are you starting?</legend>
        <div className={styles.levels}>
          {LEVELS.map((l) => (
            <label key={l.id} className={level === l.id ? styles.levelOn : styles.level}>
              <input type="radio" name="level" checked={level === l.id} onChange={() => setLevel(l.id)} />
              <strong>{l.label}</strong>
              <span>{l.detail}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.field}>
        <legend>Focus (optional — leave empty to cover the whole API)</legend>
        <div className={styles.topics}>
          {TOPICS.map((t) => (
            <label key={t.id} className={styles.topic}>
              <input
                type="checkbox"
                checked={focus.includes(t.id)}
                onChange={(e) =>
                  setFocus(e.target.checked ? [...focus, t.id] : focus.filter((id) => id !== t.id))
                }
              />
              <span>
                <b>{t.id.replace("lab-", "Lab ")}</b> {t.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.actions}>
        <button type="button" className="button button--primary" onClick={() => setConfirming(true)}>
          Review scope
        </button>
      </div>
    </section>
  );
}
