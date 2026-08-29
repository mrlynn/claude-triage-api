import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import { NorthwindMark } from "@site/src/components/NorthwindLogo";
import { Backdrop, Photo, Shot } from "@site/src/components/SlideDeck/media";
import styles from "@site/src/components/SlideDeck/styles.module.css";

/**
 * The intro talk, as data.
 *
 * This is the first 35 minutes of Day 1 — the scenario segment and the
 * concept map segment from curriculum/02-run-of-show.md — in a form you can
 * project. Every claim and every number on these slides already appears in
 * curriculum/scenario.md or curriculum/00-concept-map.md. When those pages
 * change, change this one; a deck that has drifted from the labs is worse
 * than no deck, because the room believes the screen.
 *
 * `notes` is written to be *spoken from*, not read out. Short prompts, the
 * beat the slide exists for, and — where the run of show says a segment has
 * a step instructors skip — the reminder not to skip it.
 *
 * ON THE PICTURES: the first four slides carry photographs from the shop's
 * own catalogue and stills of the live storefront, because the claim they
 * make — this is a real company with a real queue and a real bottle in it —
 * is one the room should be shown rather than told. From slide five on, the
 * content is technical and a picture would be decoration, so there are none.
 * See components/SlideDeck/media.tsx for where the files come from.
 */

export type Slide = {
  /** Stable id. Used for React keys and the aria-label on the dot strip. */
  id: string;
  /** Shown in the dot strip tooltip and the notes panel header. */
  title: string;
  /** Roughly how long this slide should take, for the notes panel. */
  minutes: number;
  body: ReactNode;
  notes: ReactNode;
};

export const SLIDES: Slide[] = [
  {
    id: "title",
    title: "Title",
    minutes: 1,
    body: (
      <Backdrop name="hero-basecamp">
        <NorthwindMark size={84} variant="inverted" />
        <p className={styles.eyebrow}>A hands-on course</p>
        <h1>Building with the Claude API</h1>
        <p className={styles.lead}>
          Structured outputs, tool use, streaming and caching — learned on a
          support queue where being wrong costs a person, not a metric.
        </p>
        <p className={styles.byline}>Northwind Outfitters · triage.mlynn.dev</p>
      </Backdrop>
    ),
    notes: (
      <>
        <p>
          Set the frame before the agenda: this is a build course, not a survey.
          Everyone writes code in the first forty minutes.
        </p>
        <p>
          Say up front that Northwind is invented and the shapes are not — it
          buys credibility now and saves the question later.
        </p>
      </>
    ),
  },

  {
    id: "stakes",
    title: "The stakes",
    minutes: 8,
    body: (
      <div className={styles.split}>
        <div>
          <p className={styles.eyebrow}>Why this course exists</p>
          <h2>A support queue is where a company finds out it hurt someone.</h2>
          <div className={styles.quote}>
            <p>“Hi, probably nothing, but…”</p>
          </div>
          <p className={styles.lead}>
            October 2025. A degraded bottle liner, an allergic reaction, an
            urgent care visit. The message sat in the general queue for{" "}
            <strong>three days</strong> — the keyword layer saw no defect words.
            Legal found out from the customer’s attorney.
          </p>
          <ul className={styles.beats}>
            <li>
              Handbook §5.4 exists because of that phrase: safety reports reach
              the safety queue within one hour,{" "}
              <em>even if the customer says it is not a big deal.</em>
            </li>
            <li>
              <span className={styles.ember}>The point:</span> a false negative
              on safety is unacceptable; a false positive costs almost nothing.
              That asymmetry is why the schema looks the way it does.
            </li>
          </ul>
        </div>
        <Photo
          name="basecamp-bottle-32"
          caption={
            <>
              <b>Basecamp Insulated Bottle 32oz</b> · $42.50 · lifetime
              workmanship guarantee
            </>
          }
        />
      </div>
    ),
    notes: (
      <>
        <p>
          Slow down here. This beat is the spine of the whole course — read it
          as a story, not a bullet list, and let the three days land.
        </p>
        <p>
          The techniques are ordinary. The reason to get them{" "}
          <em>right</em> — calibrate the confidence score, return the trace,
          write the gold case you know will fail — only shows up when the cost
          of being wrong is a person.
        </p>
        <p>
          If you want the room active: point them at{" "}
          <Link to="/playground/queue">the inbound queue</Link> and ask how long
          it takes to find the one message that matters among twenty.
        </p>
      </>
    ),
  },

  {
    id: "company",
    title: "The company",
    minutes: 6,
    body: (
      <>
        <p className={styles.eyebrow}>Northwind Outfitters</p>
        <h2>$180M of outdoor gear — and you can go and look at it.</h2>
        <div className={styles.split}>
          <Shot
            name="shop-home"
            caption={
              <>
                <b>northwind.mlynn.dev</b> — a working shop, down to a support
                form that runs the real triage service on whatever you type.
              </>
            }
          />
          <div>
            <div className={styles.stats}>
              <div>
                <b>4,100</b>
                <span>tickets a week</span>
              </div>
              <div>
                <b>11,300</b>
                <span>peak week, Nov–Dec</span>
              </div>
              <div>
                <b>34 → 46</b>
                <span>agents on shift</span>
              </div>
              <div>
                <b>14 → 41 hrs</b>
                <span>median first response</span>
              </div>
            </div>
            <p className={styles.lead}>
              Triage is a human reading all 4,100 — in December, a seasonal hire
              on their fifth day who has not read the handbook.
            </p>
          </div>
        </div>
      </>
    ),
    notes: (
      <>
        <p>
          Keep this fast — it is context, not content. The one number to say out
          loud is the seasonal swing: the team is sized for neither week.
        </p>
        <p>
          The lifetime guarantee is the most important commercial fact about
          them. It is why customers pay $189 for a shell, it makes support
          structurally more expensive than competitors’, and it is why “just
          deny the claim” is never the right answer.
        </p>
        <p>
          If the room has laptops open, send them to the shop now rather than
          later. Everything lands easier once someone has seen the price tag on
          the jacket they are about to complain about.
        </p>
      </>
    ),
  },

  {
    id: "in-and-out",
    title: "In and out",
    minutes: 5,
    body: (
      <>
        <p className={styles.eyebrow}>The system, end to end</p>
        <h2>A message goes in. Only what needs a person comes out.</h2>
        <div className={styles.shots}>
          <Shot name="support-form" caption={<>Anyone can type into this.</>} />
          <Shot
            name="escalation-queue"
            caption={<>Only what a person has to see reaches this.</>}
          />
        </div>
        <p className={styles.lead}>
          Between them: one Claude call with a schema attached.{" "}
          <span className={styles.ember}>
            Storage is a consequence of escalation, not of submission.
          </span>
        </p>
      </>
    ),
    notes: (
      <>
        <p>
          Both screens are live. If the room is warm, type the October 2025
          incident into the support form now — “the bottle lining flaked and my
          kid swallowed a bit, probably nothing” — and let them watch it reach{" "}
          <code>persist</code> and come back with a ticket id.
        </p>
        <p>
          Then point at the right-hand card: <code>DEMO-NW-T-1045</code>, tagged{" "}
          <b>safety</b> and <b>urgent</b> at 0.88 confidence. That is the same
          incident, already encoded as a fixture the labs test against.
        </p>
        <p>
          A routine ticket produces no id at all. Say that out loud — it is the
          cheapest possible illustration of a design decision they will make
          themselves in Lab 2.
        </p>
      </>
    ),
  },

  {
    id: "one-endpoint",
    title: "Everything is one endpoint",
    minutes: 5,
    body: (
      <>
        <p className={styles.eyebrow}>The concept map, in one line</p>
        <h2>
          Everything is <code>POST /v1/messages</code>.
        </h2>
        <div className={styles.branches}>
          <div className={styles.trunk}>POST /v1/messages</div>
          <div className={styles.leaves}>
            <div>
              <b>output_config</b>
              <span>shape + effort</span>
            </div>
            <div>
              <b>tools</b>
              <span>function calling</span>
            </div>
            <div>
              <b>stream</b>
              <span>delivery</span>
            </div>
            <div>
              <b>cache_control</b>
              <span>cost of the prefix</span>
            </div>
          </div>
        </div>
        <p className={styles.lead}>
          Structured outputs, tool use and streaming are not three APIs. They are
          three parameters on the same request. Once you can make one call,
          every other capability is a field you add to it.
        </p>
      </>
    ),
    notes: (
      <>
        <p>
          This is the single most useful thing to internalize early, and it is
          worth saying twice. People arrive expecting four integrations.
        </p>
        <p>
          The supporting endpoints — <code>count_tokens</code>,{" "}
          <code>batches</code>, <code>files</code>, <code>models</code> — feed
          into or describe this one. Nothing else to learn structurally.
        </p>
      </>
    ),
  },

  {
    id: "capabilities",
    title: "Four capabilities",
    minutes: 6,
    body: (
      <>
        <p className={styles.eyebrow}>Four capabilities</p>
        <h2>The right-hand column is the one that matters.</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Capability</th>
              <th>Parameter</th>
              <th>Use it when</th>
              <th className={styles.emphCol}>Don’t use it when</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Structured outputs</td>
              <td>
                <code>output_config.format</code>
              </td>
              <td>Another program consumes the result</td>
              <td className={styles.emphCol}>A human reads it as prose</td>
            </tr>
            <tr>
              <td>Tool use</td>
              <td>
                <code>tools</code>
              </td>
              <td>The answer depends on data the model can’t have</td>
              <td className={styles.emphCol}>
                You already know what to fetch — just fetch it
              </td>
            </tr>
            <tr>
              <td>Streaming</td>
              <td>
                <code>.stream()</code>
              </td>
              <td>A human is waiting and watching</td>
              <td className={styles.emphCol}>
                A program is waiting; it adds complexity, no value
              </td>
            </tr>
            <tr>
              <td>Prompt caching</td>
              <td>
                <code>cache_control</code>
              </td>
              <td>A large, stable prefix repeats</td>
              <td className={styles.emphCol}>Each request is unique</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
    notes: (
      <>
        <p>
          Read the last column, not the third. The most common architectural
          mistake in the room is reaching for tool use when a plain lookup plus
          one call would do — an extra round trip and an extra inference, buying
          nothing when the retrieval logic is deterministic.
        </p>
        <p>
          Labs 2 through 5 are these four rows in order. Say that, so the shape
          of the day is visible.
        </p>
      </>
    ),
  },

  {
    id: "tiers",
    title: "Choosing a tier",
    minutes: 5,
    body: (
      <>
        <p className={styles.eyebrow}>How much machinery to build</p>
        <h2>Single call → workflow → agent.</h2>
        <div className={styles.ladder}>
          <div>
            <b>single call</b>
            <span>cheapest · fastest</span>
          </div>
          <div>
            <b>workflow</b>
            <span>you orchestrate · predictable · debuggable</span>
          </div>
          <div>
            <b>agent</b>
            <span>model orchestrates · most capable · least predictable</span>
          </div>
        </div>
        <p className={styles.lead}>
          Check all four before you climb: <strong>complexity</strong>,{" "}
          <strong>value</strong>, <strong>viability</strong>,{" "}
          <strong>cost of error</strong>. “No” to any one means drop a tier.
        </p>
        <ul className={styles.beats}>
          <li>
            In this repo <code>/v1/triage</code> and <code>/v1/draft</code> are
            single calls. <code>/v1/resolve</code> is an agent — and it earns
            it, because which lookups are needed depends on what the earlier
            lookups returned.
          </li>
        </ul>
      </>
    ),
    notes: (
      <>
        <p>
          Separate this from model choice explicitly — the two get confused
          constantly. This ladder is how much machinery you build; model tiering
          is which model that machinery calls. Independent decisions.
        </p>
        <p>
          Orchestrator-workers is deliberately absent from this codebase.
          Nothing here needs a model to invent its own subtasks. The fact that a
          pattern has a name is not an argument for using it.
        </p>
      </>
    ),
  },

  {
    id: "cost",
    title: "The cost model",
    minutes: 5,
    body: (
      <>
        <p className={styles.eyebrow}>The mental model for cost</p>
        <h2>Three consequences that drive most optimization work.</h2>
        <ol className={styles.numbered}>
          <li>
            <b>Output is the expensive half.</b> A 5× rate multiplier on Opus 5
            means trimming a verbose response saves more than trimming a long
            prompt.
          </li>
          <li>
            <b>Caching only helps a repeated prefix.</b> It cannot help the first
            request, and it cannot help a prefix under ~1024 tokens.
          </li>
          <li>
            <b>Cache writes cost more than fresh tokens.</b> 1.25× to write,
            0.10× to read — caching a prefix used once is strictly worse than
            not caching it.
          </li>
        </ol>
        <p className={styles.lead}>
          <span className={styles.ember}>And check the premise:</span> at
          Northwind’s volume every model tier lands far under budget. Cost is
          often not the binding constraint the room assumes it is.
        </p>
      </>
    ),
    notes: (
      <>
        <p>
          Lab 5 measures all three. Do not pre-empt the numbers here — this
          slide is the model, the lab is the evidence.
        </p>
        <p>
          The failure mode they will actually hit:{" "}
          <code>cache_read_input_tokens</code> stuck at 0, because something
          varies in the prefix. It is almost always a timestamp.
        </p>
      </>
    ),
  },

  {
    id: "where-this-goes",
    title: "Where this goes",
    minutes: 4,
    body: (
      <>
        <p className={styles.eyebrow}>The rest of the day</p>
        <h2>Every lab ends in a measurement, not an opinion.</h2>
        <ol className={styles.labs}>
          <li>
            <b>Lab 0</b> <span>Record a baseline before you change anything</span>
          </li>
          <li>
            <b>Lab 1</b> <span>One call. Model, message, response, tokens</span>
          </li>
          <li>
            <b>Lab 2</b> <span>A schema your software can safely consume</span>
          </li>
          <li>
            <b>Lab 3</b> <span>Tools retrieve facts; code enforces authority</span>
          </li>
          <li>
            <b>Lab 4</b> <span>Stream it, and handle the ending states</span>
          </li>
          <li>
            <b>Lab 5</b> <span>Keep the policy prefix warm</span>
          </li>
          <li>
            <b>Lab 6</b> <span>Find out whether any of it works</span>
          </li>
          <li>
            <b>Labs 7–9</b> <span>Model choice, the trust boundary, shipping</span>
          </li>
        </ol>
        <p className={styles.lead}>
          Next: <Link to="/docs/labs/lab-0-scoreboard">Lab 0</Link>. Paper and
          pen first — laptops closed.
        </p>
      </>
    ),
    notes: (
      <>
        <p>
          <span className={styles.ember}>Do not turn Lab 0 into a command demo.</span>{" "}
          Two minutes, silent, everyone hand-labels NW-T-1045, NW-T-1047 and
          NW-T-1060 on paper. Then compare with a neighbour.
        </p>
        <p>
          Most rooms disagree on NW-T-1060. Ask why — the disagreement is about
          the <em>schema</em>, not the ticket: a multi-intent message against a
          single-label field. That reframe is what makes Lab 2 land, and you get
          it free in minute forty.
        </p>
        <p>
          Only then run <code>npm run eval:quick</code>, and{" "}
          <code>-- --save</code> to record the baseline everything else compares
          against.
        </p>
      </>
    ),
  },
];
