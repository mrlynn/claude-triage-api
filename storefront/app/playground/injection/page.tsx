import type { Metadata } from "next";
import InjectionPlayground from "./InjectionPlayground";

export const metadata: Metadata = {
  title: "Try to break the classifier — Northwind Outfitters",
  description:
    "A live prompt-injection playground. Run real payloads against the classifier with the defences on or off, and see exactly what the model was shown.",
};

export default function InjectionPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-[11px] uppercase tracking-wide text-pine/50">
          Engineering demo
        </p>
        <h1 className="text-2xl font-semibold text-pine sm:text-3xl">
          Try to break the classifier
        </h1>
        <p className="max-w-2xl text-pine/75">
          Every support ticket on this site is classified by Claude, and every
          ticket is written by a member of the public. That makes the message a{" "}
          <em>trust boundary</em>: the model has to read the text without taking
          orders from it.
        </p>
        <p className="max-w-2xl text-pine/75">
          Pick a payload or write your own, then toggle the defences off to see
          what this app did before the boundary was fixed. The panel on the
          right shows the exact block the model received, so you can watch the
          escaping happen rather than take our word for it.
        </p>
      </header>

      <InjectionPlayground />

      <section className="rounded-lg border border-pine/15 bg-white/40 p-5">
        <h2 className="text-sm font-semibold text-pine">What this does not prove</h2>
        <p className="mt-2 max-w-2xl text-sm text-pine/70">
          A message that fails to change the classification here has failed{" "}
          <em>once</em>. Escaping the delimiters is a structural guarantee — no
          arrangement of characters builds a tag once <code>&lt;</code> is gone
          — but everything downstream of that is the model exercising judgement
          about persuasive text, and judgement is a probability rather than a
          proof. That is why the money decisions in this system are checked by
          arithmetic, not by asking the model whether it was allowed.
        </p>
      </section>
    </div>
  );
}
