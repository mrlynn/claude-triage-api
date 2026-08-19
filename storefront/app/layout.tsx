import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northwind Outfitters",
  description:
    "Technical outdoor gear, guaranteed for the life of the gear. A fictional storefront built for the Claude API triage workshop.",
};

function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#1F3D33" />
      <path d="M42 26 L58 47 H30 Z" fill="#5C9A86" />
      <path d="M26 16 L44 47 H8 Z" fill="#F2EDE4" />
      <path d="M26 16 L32 26 L28.5 25 L26 28 L23 24.5 L20 26 Z" fill="#1F3D33" />
    </svg>
  );
}

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

        <header className="border-b border-pine/12 bg-bone/90 backdrop-blur sticky top-0 z-10">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <Mark />
              <span className="leading-none">
                <span className="block text-[15px] font-extrabold tracking-tight">
                  NORTHWIND
                </span>
                <span className="block text-[8px] font-semibold tracking-[0.34em] text-spruce mt-0.5">
                  OUTFITTERS
                </span>
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-5 text-sm">
              <Link href="/products" className="hover:text-spruce">
                Shop
              </Link>
              <Link href="/orders" className="hover:text-spruce">
                Your orders
              </Link>
              <Link
                href="/support"
                className="rounded-md bg-pine px-3 py-1.5 text-bone hover:bg-spruce"
              >
                Support
              </Link>
            </div>
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>

        <footer className="border-t border-pine/12 mt-16">
          <div className="mx-auto max-w-6xl px-5 py-8 text-xs text-pine/65 space-y-2">
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
              workshop on building with the Claude API.{" "}
              <a
                href="https://github.com/mrlynn/claude-triage-api"
                className="underline underline-offset-2"
              >
                Source
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
