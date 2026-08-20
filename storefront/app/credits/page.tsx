import type { Metadata } from "next";
import Link from "next/link";
import { GEAR_IMAGES, credits } from "@/lib/gear-images";

export const metadata: Metadata = {
  title: "Photo credits — Northwind Outfitters",
  description: "The photographers whose work makes this fictional shop look real.",
};

/**
 * Attribution.
 *
 * The Unsplash License does not require this. It is here because someone's
 * photograph is being used to make a fake company convincing, and because
 * this repo gets forked and read — a credits page is the version of "be
 * decent about it" that survives being copied.
 */
export default function CreditsPage() {
  const people = credits();
  const total = Object.keys(GEAR_IMAGES).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-3">
        <p className="text-[11px] uppercase tracking-wide text-pine/50">Colophon</p>
        <h1 className="text-2xl font-semibold text-pine sm:text-3xl">Photo credits</h1>
        <p className="text-pine/75">
          Northwind Outfitters is a fictional company built for a Claude API
          workshop. Nothing here is for sale, and the products do not exist —
          but the {total} photographs do, and they are what make the shop
          convincing enough to be worth filing a support ticket into.
        </p>
        <p className="text-pine/75">
          All from{" "}
          <a className="underline" href="https://unsplash.com">
            Unsplash
          </a>
          , used under the Unsplash License, which asks for no permission and
          strictly requires no credit. Credit is given anyway.
        </p>
      </header>

      <ul className="divide-y divide-pine/10 rounded-lg border border-pine/15 bg-white/40">
        {people.map((p) => (
          <li key={p.username} className="flex items-baseline justify-between gap-4 p-4">
            <a
              className="text-pine underline"
              href={`https://unsplash.com/@${p.username}`}
            >
              {p.photographer}
            </a>
            <span className="font-mono text-[11px] tabular-nums text-pine/50">
              {p.count} photo{p.count === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-sm text-pine/60">
        Every image is vendored into this repository rather than hot-linked, so
        the shop works offline and does not break when a photographer removes a
        photo. The manifest, including which photo is used where, is in{" "}
        <code>lib/gear-images.ts</code>.
      </p>

      <p className="text-sm">
        <Link className="underline" href="/">
          Back to the shop
        </Link>
      </p>
    </div>
  );
}
