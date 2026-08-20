import { useMemo, useState, type ReactNode } from "react";
import styles from "./styles.module.css";

/**
 * Sync versus batch, with the cache in the model.
 *
 * The point of this widget is one counterintuitive result: on a workload with
 * a large stable prefix, the Batches API can cost MORE than the synchronous
 * path, because the 50% batch discount competes with the 90% cache discount
 * rather than composing with it.
 *
 * The measured run on this repo — twenty tickets, ~3,400-token handbook — came
 * out at $0.1645 synchronous (20/20 cache hits) against $0.2018 batch (11/20).
 * The sliders let you find the crossover for your own shape.
 *
 * Nothing here calls an API. The arithmetic is the same arithmetic
 * `summarizeUsage` does, with the cache-hit rate as the free variable.
 */

const PRICING = {
  inputPerMTok: 5.0,
  outputPerMTok: 25.0,
  cacheReadMultiplier: 0.1,
  cacheWriteMultiplier: 1.25,
  batchMultiplier: 0.5,
};

/** Measured against claude-opus-5 with this repo's prompts. */
const MEASURED = {
  prefixTokens: 3400,
  variableTokens: 112,
  outputTokens: 134,
  /** What the twenty-ticket sample actually produced. */
  syncHitRate: 1.0,
  batchHitRate: 0.55,
};

interface Costs {
  perRequest: number;
  weekly: number;
}

/**
 * @param hitRate Fraction of requests whose prefix is warm.
 * @param batch   Apply the Batches API discount.
 */
function cost(prefixTokens: number, hitRate: number, batch: boolean, volume: number): Costs {
  const discount = batch ? PRICING.batchMultiplier : 1;
  const inRate = (PRICING.inputPerMTok / 1_000_000) * discount;
  const outRate = (PRICING.outputPerMTok / 1_000_000) * discount;

  // A warm request reads the prefix at 0.1x; a cold one writes it at 1.25x.
  const warmPrefix = prefixTokens * inRate * PRICING.cacheReadMultiplier;
  const coldPrefix = prefixTokens * inRate * PRICING.cacheWriteMultiplier;
  const blendedPrefix = hitRate * warmPrefix + (1 - hitRate) * coldPrefix;

  const perRequest =
    blendedPrefix +
    MEASURED.variableTokens * inRate +
    MEASURED.outputTokens * outRate;

  return { perRequest, weekly: perRequest * volume };
}

const usd = (n: number) => (n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

export default function BatchPlanner(): ReactNode {
  const [prefixTokens, setPrefixTokens] = useState(MEASURED.prefixTokens);
  const [batchHitRate, setBatchHitRate] = useState(MEASURED.batchHitRate);
  const [volume, setVolume] = useState(4100);

  const sync = useMemo(
    () => cost(prefixTokens, MEASURED.syncHitRate, false, volume),
    [prefixTokens, volume],
  );
  const batch = useMemo(
    () => cost(prefixTokens, batchHitRate, true, volume),
    [prefixTokens, batchHitRate, volume],
  );

  const batchWins = batch.weekly < sync.weekly;
  const delta = Math.abs(batch.weekly - sync.weekly);
  const deltaPct = sync.weekly > 0 ? (delta / sync.weekly) * 100 : 0;

  /** The batch hit rate at which the two are equal, given the other inputs. */
  const breakEven = useMemo(() => {
    for (let r = 0; r <= 1.0001; r += 0.01) {
      if (cost(prefixTokens, r, true, volume).weekly <= sync.weekly) return r;
    }
    return null;
  }, [prefixTokens, volume, sync.weekly]);

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <fieldset className={styles.field}>
          <legend>Cached prefix</legend>
          <input
            className={styles.slider}
            type="range"
            min={200}
            max={20000}
            step={100}
            value={prefixTokens}
            onChange={(e) => setPrefixTokens(Number(e.target.value))}
          />
          <div className={styles.value}>{prefixTokens.toLocaleString()} tokens</div>
          <p className={styles.hint}>
            This repo&rsquo;s policy handbook is ~3,400. Below ~1,024 the API
            declines to cache at all.
          </p>
        </fieldset>

        <fieldset className={styles.field}>
          <legend>Batch cache-hit rate</legend>
          <input
            className={styles.slider}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={batchHitRate}
            onChange={(e) => setBatchHitRate(Number(e.target.value))}
          />
          <div className={styles.value}>{Math.round(batchHitRate * 100)}%</div>
          <p className={styles.hint}>
            Measured at <strong>55%</strong> (11/20) on the twenty-ticket
            sample. Synchronous hit 100%.
          </p>
        </fieldset>

        <fieldset className={styles.field}>
          <legend>Tickets per week</legend>
          <input
            className={styles.slider}
            type="range"
            min={500}
            max={50000}
            step={500}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <div className={styles.value}>{volume.toLocaleString()}</div>
          <p className={styles.hint}>Northwind runs 4,100.</p>
        </fieldset>
      </div>

      <div className={styles.results}>
        <div className={batchWins ? styles.card : styles.cardWin}>
          <div className={styles.cardTitle}>Synchronous</div>
          <div className={styles.big}>{usd(sync.weekly)}</div>
          <div className={styles.sub}>per week · {usd(sync.perRequest)} each</div>
          <div className={styles.meta}>100% cache hits</div>
        </div>

        <div className={batchWins ? styles.cardWin : styles.card}>
          <div className={styles.cardTitle}>Batches API</div>
          <div className={styles.big}>{usd(batch.weekly)}</div>
          <div className={styles.sub}>per week · {usd(batch.perRequest)} each</div>
          <div className={styles.meta}>
            {Math.round(batchHitRate * 100)}% cache hits · half rate
          </div>
        </div>
      </div>

      <p className={batchWins ? styles.verdictGood : styles.verdictBad}>
        {batchWins ? (
          <>
            Batch is cheaper by {usd(delta)} a week ({deltaPct.toFixed(0)}%).
          </>
        ) : (
          <>
            Batch costs <strong>{usd(delta)} more</strong> a week (
            {deltaPct.toFixed(0)}%) — the 50% batch discount does not cover the
            90% cache discount it costs you.
          </>
        )}
      </p>

      <p className={styles.footnote}>
        {breakEven === null ? (
          <>
            At this prefix size, batch does not win at any cache-hit rate. The
            prefix dominates the request, and a warm synchronous read is simply
            cheaper than a half-price cold one.
          </>
        ) : (
          <>
            Break-even is a batch cache-hit rate of{" "}
            <strong>{Math.round(breakEven * 100)}%</strong>. Below that,
            synchronous wins. Measure yours with a pilot before committing —{" "}
            <code>npm run triage:queue:batch</code> reports it.
          </>
        )}
      </p>
    </div>
  );
}
