import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import { LABS_URL, SITE_URL, labs } from "@/lib/links";

/*
  Most arrivals here are cold — a link in a feed, no context. The card the
  feed renders is the whole first impression, and until now there was no
  openGraph block at all, so LinkedIn scraped a fragment of the shop copy and
  the post read as an ad for outdoor gear.

  So the card sells the demo, not the fiction: the title says the shop is not
  real and the description says what actually happens if you click. The page
  itself can then keep its in-world voice, because the framing already landed.
*/
const DESCRIPTION =
  "A fictional gear shop with a real support desk behind it. File a complaint and watch Claude read it, rank it, and decide whether a human sees it.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Northwind Outfitters",
  description: DESCRIPTION,
  openGraph: {
    title: "A shop that isn't real. Its support desk is.",
    description: DESCRIPTION,
    url: "/",
    siteName: "Northwind Outfitters",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Northwind Outfitters — a fictional shop whose support desk runs a live Claude classifier.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "A shop that isn't real. Its support desk is.",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bone text-pine antialiased">
        {/*
          Two sentences on a phone wrap to two lines and cost ~90px before the
          logo even appears — a tenth of the first viewport spent on a
          disclaimer. The full sentence stays on wider screens; mobile gets the
          half that matters, since "nothing here is for sale" is the part a
          visitor needs and the workshop link is the part they can still tap.
        */}
        <div className="bg-pine px-4 py-1.5 text-center text-xs text-bone">
          <span className="hidden sm:inline">
            Fictional company. Nothing here is for sale. Built for the{" "}
          </span>
          <span className="sm:hidden">Fictional shop &mdash; </span>
          <a
            href={LABS_URL}
            className="underline underline-offset-2 hover:text-white"
          >
            Claude API triage workshop
          </a>
          .
        </div>

        <SiteHeader />

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-5 sm:py-10">{children}</main>

        {/*
          Page-view analytics, so "is anyone actually using this" has an
          answer. Vercel's own, rather than something hand-rolled: a custom
          dashboard would mean a store, a schema and a UI to maintain, all
          competing with a thing that already exists and is better.

          No cookies and no cross-site identifier, which matters on a page
          that also asks members of the public to type support messages.
        */}
        <Analytics />

        <footer className="border-t border-pine/12 mt-16">
          <div className="mx-auto max-w-6xl px-4 py-8 text-xs sm:px-5 text-pine/65 space-y-2">
            <p className="font-semibold">
              Guaranteed for the life of the gear.
            </p>
            <p>
              Returns within 60 days. Defective items have no return window —
              we replace or refund them regardless of age. Refunds take 5&ndash;7
              business days to appear on your statement.
            </p>
            <p>
              <a className="underline" href="/credits">
                Photo credits
              </a>{" "}
              &mdash; the shop is fictional, the photographs are not.
            </p>
            <p>
              Northwind Outfitters does not exist. It is the scenario behind a
              workshop on building with the Claude API &mdash; read{" "}
              <a
                href={labs("/docs/scenario")}
                className="underline underline-offset-2"
              >
                who they are and why
              </a>
              , take{" "}
              <a
                href={labs("/docs/labs/lab-1-first-call")}
                className="underline underline-offset-2"
              >
                the labs
              </a>
              , or read the{" "}
              <a
                href="https://github.com/mrlynn/claude-triage-api"
                className="underline underline-offset-2"
              >
                source
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
