import type { Metadata } from "next";
import { LABS_URL, SITE_URL } from "@/lib/links";

/**
 * Per-page metadata.
 *
 * WHY A HELPER: Next merges `metadata` shallowly, so a page that sets only
 * `title` inherits the layout's whole `openGraph` block — including its
 * `url: "/"`. Every page on this site was telling crawlers it was the home
 * page, and with no canonical anywhere, search engines and AI indexes saw one
 * page with many addresses. Building the block here means a page cannot set a
 * title without also getting its own canonical and its own card.
 */
export function pageMetadata({
  title,
  description,
  path,
  index = true,
}: {
  title: string;
  description: string;
  /** Path on this site, e.g. "/support". Becomes the canonical URL. */
  path: string;
  /**
   * False for pages that only make sense inside the demo — fake products,
   * fake orders, live tickets. They stay crawlable so the noindex is seen,
   * but they should never be a search result for a shop that does not exist.
   */
  index?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "Northwind Outfitters",
      type: "website",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}

export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Northwind Outfitters — a fictional shop whose support desk runs a live Claude classifier.",
};

/**
 * Pages worth finding from a search. Everything else is either noindexed or
 * private; `app/sitemap.ts` lists exactly these.
 */
export const INDEXED_PATHS = [
  "/",
  "/support",
  "/assistant",
  "/playground/messages",
  "/playground/injection",
  "/playground/live",
  "/credits",
] as const;

/**
 * Structured data for the whole site.
 *
 * Deliberately NOT `Store`, `Product` or `Offer`. Those would put a retailer
 * that does not exist into shopping results and knowledge panels, and an AI
 * answer asked about "Northwind Outfitters" would describe a gear shop. This
 * says what the site actually is — a demo application that belongs to the
 * course — and the `@id` matches the Course node the labs site publishes, so
 * the two domains resolve to one entity.
 */
export const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": `${SITE_URL}/#app`,
  name: "Northwind Outfitters (demo)",
  alternateName: "Northwind Outfitters",
  url: SITE_URL,
  description:
    "A fictional outdoor-gear shop built as a teaching demo. It is not a real retailer and nothing is for sale. Its support desk runs a live Claude API triage classifier that learners can watch, test and try to break.",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any",
  isAccessibleForFree: true,
  inLanguage: "en",
  isPartOf: {
    "@type": "Course",
    "@id": `${LABS_URL}/#course`,
    name: "Claude API hands-on course",
    url: `${LABS_URL}/`,
  },
};
