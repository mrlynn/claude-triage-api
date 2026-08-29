import type { ReactNode } from "react";
import Layout from "@theme/Layout";
import SlideDeck from "@site/src/components/SlideDeck";

/**
 * The intro talk, as slides.
 *
 * Deliberately unlisted — no navbar or footer entry. It is a presenter's
 * surface for the first 35 minutes of Day 1, and a learner who lands on it
 * mid-lab gets a summary of things they are better off discovering. The
 * run of show is where it is linked from.
 */
export default function TalkPage(): ReactNode {
  return (
    <Layout
      noFooter
      title="Intro talk"
      description="Slideshow mode for the course introduction: the Northwind scenario and the concept map."
    >
      <main>
        <SlideDeck />
      </main>
    </Layout>
  );
}
