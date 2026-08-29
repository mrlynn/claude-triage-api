import { useEffect, type ReactNode } from "react";
import Layout from "@theme/Layout";
import BrowserOnly from "@docusaurus/BrowserOnly";

/**
 * The presenter window's route.
 *
 * Opened by the deck at /talk, but a plain URL as well: a window that can only
 * be produced by a button is a window you cannot recover when the browser eats
 * the pop-up mid-talk. It finds the deck by itself either way.
 *
 * BrowserOnly, because everything this renders is a live link to another
 * window — there is no meaningful server render of "what the other tab is
 * doing", and pre-rendering an empty shell would only flash.
 */
export default function PresenterPage(): ReactNode {
  // The navbar is 60px of site chrome in a window that exists to show four
  // things at a glance. A body class is the least invasive way to drop it,
  // since Layout always renders the navbar.
  useEffect(() => {
    document.body.classList.add("nw-presenter");
    return () => document.body.classList.remove("nw-presenter");
  }, []);

  return (
    <Layout
      noFooter
      title="Presenter view"
      description="Speaker notes for the intro talk, synchronised with the deck."
    >
      <BrowserOnly>{() => {
        const PresenterView = require("@site/src/components/SlideDeck/PresenterView").default;
        return <PresenterView />;
      }}</BrowserOnly>
    </Layout>
  );
}
