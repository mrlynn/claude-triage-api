import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Northwind Outfitters",
  description:
    "Technical outdoor gear, guaranteed for the life of the gear. A fictional storefront built for the Claude API triage workshop.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bone text-pine antialiased">
        <div className="bg-pine text-bone text-center text-xs py-1.5 px-4">
          Fictional company. Nothing here is for sale. Built for the{" "}
          <a
            href="https://claude-triage-labs.vercel.app"
            className="underline underline-offset-2 hover:text-white"
          >
            Claude API triage workshop
          </a>
          .
        </div>

        <SiteHeader />

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-5 sm:py-10">{children}</main>

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
              Northwind Outfitters does not exist. It is the scenario behind a
              workshop on building with the Claude API &mdash; read{" "}
              <a
                href="https://claude-triage-labs.vercel.app/docs/scenario"
                className="underline underline-offset-2"
              >
                who they are and why
              </a>
              , take{" "}
              <a
                href="https://claude-triage-labs.vercel.app/docs/labs/lab-1-first-call"
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
