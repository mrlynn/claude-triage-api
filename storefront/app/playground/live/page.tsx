import type { Metadata } from "next";
import LiveEvaluator from "./LiveEvaluator";
import { labs } from "@/lib/links";

export const metadata: Metadata = {
  title: "Watch it read as you type — Northwind Outfitters",
  description:
    "A live triage preview. Every time you pause, a cheap model reads what you have written so far and fills in category, sentiment and urgency — then the real classifier tells you where it was wrong.",
};

export default function LivePage() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-[11px] uppercase tracking-wide text-pine/50">
          Engineering demo
        </p>
        <h1 className="text-2xl font-semibold text-pine sm:text-3xl">
          Watch it read as you type
        </h1>
        <p className="max-w-2xl text-pine/75">
          The support form classifies a message once, after you press send. This
          page classifies it continuously, while you write. Every time you stop
          typing for half a second, the last thing you wrote goes to a model and
          the panel fills in field by field, in the order the model emits them.
        </p>
        <p className="max-w-2xl text-pine/75">
          It is the same policy handbook and the same trust boundary as the real
          classifier &mdash; and a different, cheaper model, because a hint that
          runs thirty times per message cannot cost what a verdict costs. When
          you are done, commit the message to the real classifier and see where
          the cheap read was wrong.
        </p>
      </header>

      <LiveEvaluator />

      <section className="rounded-lg border border-pine/15 bg-white/40 p-5">
        <h2 className="text-sm font-semibold text-pine">
          Why this is harder than it looks
        </h2>
        <div className="mt-2 grid gap-4 text-sm leading-relaxed text-pine/70 sm:grid-cols-3">
          <div>
            <p className="font-medium text-pine">The bill is set by your typing.</p>
            <p className="mt-1">
              Classifying on every keystroke is fifty calls per sentence. The
              debounce fires on the pause instead, which is also the only moment
              a person can read the answer. Cheaper and better, in that order.
            </p>
          </div>
          <div>
            <p className="font-medium text-pine">A cancelled request still spends.</p>
            <p className="mt-1">
              Closing the browser&rsquo;s connection does not stop the model. The
              abort signal has to reach the API call itself, or you pay in full
              for answers nobody will ever see.
            </p>
          </div>
          <div>
            <p className="font-medium text-pine">Answers arrive out of order.</p>
            <p className="mt-1">
              Two runs can overlap, and the older one can land second. Every run
              carries a sequence number and late answers are dropped &mdash;
              otherwise the panel flickers backwards for no visible reason.
            </p>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-pine/70">
          The thing that makes any of it affordable is in{" "}
          <a
            href={labs("/docs/labs/lab-5-cost-and-caching")}
            className="underline underline-offset-2"
          >
            Lab 5
          </a>
          : the policy handbook is the same bytes on every one of these calls,
          cached, so a preview reads it at a tenth of the input rate. The
          per-call cost in the panel is measured, not modelled &mdash; watch the
          first one pay for the cache write and the rest read from it.
        </p>
      </section>

      <section className="rounded-lg border border-pine/15 bg-white/40 p-5">
        <h2 className="text-sm font-semibold text-pine">What this is not</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-pine/70">
          It is not a second opinion you should route on. The preview reads an
          unfinished sentence with a smaller model, and both of those make it
          worse than the classifier that runs on submit &mdash; which is why the
          panel calls it a reading and the queue never sees it. The honest use
          of a live pass is to help the person writing: to surface, before they
          press send, that what they are describing is going to be treated as a
          safety report.
        </p>
      </section>
    </div>
  );
}
