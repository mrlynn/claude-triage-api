import { Suspense } from "react";
import SupportForm from "./SupportForm";
import { labs } from "@/lib/links";

export const metadata = { title: "Support | Northwind Outfitters" };

export default function SupportPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Contact support</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-pine/75">
        Tell us what went wrong and we will get it to the right person. Because
        this is a workshop demo, we also show you the part a customer never
        sees: how the message gets classified and routed.
      </p>

      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-pine/50">Loading&hellip;</p>}>
          <SupportForm />
        </Suspense>
      </div>

      <div className="mt-14 rounded-lg border border-pine/15 bg-white/40 p-5 text-sm leading-relaxed text-pine/75">
        <p className="font-semibold text-pine">What just happened</p>
        <p className="mt-1.5">
          Your message went to a single Claude API call with a schema attached.
          The model never chose the shape of that answer &mdash; the schema
          constrained it, and the response was validated before it reached you.
          The policy handbook that defines &ldquo;urgent&rdquo; and
          &ldquo;safety&rdquo; was in the prompt, cached so it does not get paid
          for on every request.
        </p>
        <p className="mt-2">
          That is four of the six labs, in one form submission.{" "}
          <a
            href={labs("/docs/labs/lab-2-structured-outputs")}
            className="underline underline-offset-2"
          >
            Lab 2 builds this schema.
          </a>
        </p>
      </div>
    </>
  );
}
