import type { Metadata } from "next";
import OpsDashboard from "./OpsDashboard";

export const metadata: Metadata = {
  title: "Support operations | Northwind Outfitters",
  description:
    "Operating dashboard for Northwind support: human intervention, response time, mis-routing and safety SLA across a staged triage rollout.",
};

export default function OpsPage() {
  return <OpsDashboard />;
}
