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
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/50">
          Workshop · trust boundary
        </p>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-pine sm:text-3xl">
          Try to break the classifier
        </h1>
        <p className="max-w-2xl text-sm text-pine/75">
          Pick a payload, toggle defences, and compare what the model was shown.
          Escaping is structural; everything after that is judgement — which is
          why money decisions are checked by arithmetic.
        </p>
      </header>

      <InjectionPlayground />
    </div>
  );
}
