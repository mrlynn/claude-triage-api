import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import ArchitectureSimulator from "@site/src/components/ArchitectureSimulator";

export default function MissionPage(): ReactNode {
  return <Layout title="Northwind mission" description="Make consequential Claude API decisions and see their operational consequences."><main className="container"><ArchitectureSimulator /></main></Layout>;
}
