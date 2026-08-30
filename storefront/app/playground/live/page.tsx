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
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/50">
          Workshop · live reading
        </p>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-pine sm:text-3xl">
          Watch it read as you type
        </h1>
        <p className="max-w-2xl text-sm text-pine/75">
          Pause half a second and Haiku fills the panel field by field. Commit
          to Opus to see where the cheap read was wrong. Same handbook, same
          boundary — different model, because a hint cannot cost a verdict.
        </p>
      </header>

      <LiveEvaluator />

      <section className="rounded-lg border border-pine/15 bg-white/40 p-5">
        <h2 className="text-sm font-semibold text-pine">
          Three rules that keep this honest
        </h2>
        <div className="mt-2 grid gap-4 text-sm leading-relaxed text-pine/70 sm:grid-cols-3">
          <div>
            <p className="font-medium text-pine">Fire on the pause.</p>
            <p className="mt-1">
              Debounce on the gap between keystrokes — cheaper and the only
              moment a person can read the answer.
            </p>
          </div>
          <div>
            <p className="font-medium text-pine">Abort the previous run.</p>
            <p className="mt-1">
              Closing the browser does not stop the model. The abort has to
              reach the API call or you pay for answers nobody sees.
            </p>
          </div>
          <div>
            <p className="font-medium text-pine">Drop late answers.</p>
            <p className="mt-1">
              Sequence numbers so an older run cannot overwrite a newer one and
              flicker the panel backwards.
            </p>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-pine/70">
          Affordability is{" "}
          <a
            href={labs("/docs/labs/lab-5-prompt-caching")}
            className="underline underline-offset-2"
          >
            Lab 5
          </a>
          : the handbook is cached, so previews read it at a tenth of the input
          rate. Watch the first call pay for the write and the rest read from
          it.
        </p>
      </section>
    </div>
  );
}
