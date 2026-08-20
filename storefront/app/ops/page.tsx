import { Suspense } from "react";
import type { Metadata } from "next";
import OpsDashboard from "./OpsDashboard";
import LiveQueue from "./LiveQueue";

export const metadata: Metadata = {
  title: "Support operations | Northwind Outfitters",
  description:
    "Operating dashboard for Northwind support: human intervention, response time, mis-routing and safety SLA across a staged triage rollout.",
};

/**
 * The live section renders above the dashboard on purpose. Everything below it
 * is invented operating history for a fictional company; this is row counts
 * from the database. Putting the measured thing first makes the badges do work
 * rather than decorate.
 */
export default function OpsPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <div className="rounded-lg border border-pine/15 bg-white/40 p-5 text-sm text-pine/60">
            Reading the escalation queue…
          </div>
        }
      >
        <LiveQueue />
      </Suspense>
      <OpsDashboard />
    </div>
  );
}
