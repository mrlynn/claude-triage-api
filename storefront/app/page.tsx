import Image from "next/image";
import Link from "next/link";
import { PRODUCTS, usd } from "@/lib/products";
import ProductArt from "@/components/ProductArt";
import TryClassifier from "@/components/TryClassifier";
import { gearImage } from "@/lib/gear-images";

export default function Home() {
  const featured = PRODUCTS.slice(0, 3);
  const hero = gearImage("hero-basecamp")!;
  const band = gearImage("band-trail")!;

  return (
    <>
      {/*
        The hero image carries the brand claim that the copy only asserts. A
        retailer whose landing page is type on a flat background reads as a
        wireframe, and the storefront's job is to make the fictional company
        feel real enough that the support ticket you file into it matters.

        Text sits on the image rather than beside it, with a gradient scrim
        rather than a flat overlay — a scrim keeps the photograph legible where
        there is no text over it, which a uniform darkening does not.
      */}
      {/*
        Full-bleed on mobile: `main` applies px-4, and a hero that sits flush
        under the header but inset 16px at the sides reads as a misalignment
        rather than a choice. Cancel the padding below sm, keep the inset and
        the rounded corners above it where the page has margins anyway.
      */}
      <section className="relative -mx-4 -mt-8 mb-14 overflow-hidden sm:-mt-10 sm:mx-0 sm:rounded-lg">
        {/*
          NO FIXED ASPECT RATIO ON MOBILE. A 16/10 box on a 375px viewport is
          214px tall and this content needs about 420, so with justify-end the
          overflow went UPWARD and `overflow-hidden` clipped it — the site's
          headline rendered 77px above its own container and was invisible on
          every phone.

          So: content defines the height, with a minimum to stop a short
          headline collapsing the image to a strip. The aspect ratio comes back
          at sm: and up, where the width makes the box tall enough for the text
          to fit inside it, and min-h stays as a floor even there.
        */}
        <div className="relative min-h-[27rem] w-full sm:min-h-[22rem] sm:aspect-[21/9]">
          <Image
            src={hero.src}
            alt={hero.alt}
            fill
            priority
            sizes="(min-width: 1152px) 1152px, 100vw"
            className="object-cover"
          />
          {/* Scrim: strongest bottom-left, where the type sits. */}
          <div className="absolute inset-0 bg-gradient-to-tr from-pine/85 via-pine/55 to-pine/10" />

          <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
            <h1 className="font-display max-w-3xl text-[2rem] font-extrabold leading-[1.05] tracking-tight text-bone sm:text-5xl">
              Gear that outlasts the trip.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-bone/85 sm:text-base">
              Technical shells, packs, bottles and shelter, built in the mountain
              west and guaranteed for the life of the gear. If it fails because
              we made it wrong, we replace it. No window, no receipt hunt.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="rounded-md bg-bone px-5 py-2.5 text-sm font-medium text-pine hover:bg-white"
              >
                Shop everything
              </Link>
              <Link
                href="/orders"
                className="rounded-md border border-bone/50 px-5 py-2.5 text-sm font-medium text-bone hover:border-bone"
              >
                Your orders
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/*
        Directly under the hero, above the merchandise. The order is the
        argument: the shop establishes that this is a real-feeling place, and
        then the very next thing breaks the fourth wall and hands the visitor
        the actual demo. Putting it below the product grid would bury it under
        the one section a cold arrival has no reason to read.
      */}
      <TryClassifier />

      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Featured</h2>
          <Link href="/products" className="text-sm text-spruce hover:underline">
            All products
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p, i) => (
            <Link key={p.slug} href={`/products/${p.slug}`} className="group">
              <ProductArt
                product={p}
                className="mb-3 aspect-[4/3]"
                // The first card is usually just below the fold on a laptop;
                // preloading it stops the row popping in as you scroll.
                priority={i === 0}
              />
              <h3 className="font-semibold group-hover:text-spruce">{p.name}</h3>
              <p className="mt-0.5 text-sm text-pine/65">{p.blurb}</p>
              <p className="mt-1.5 text-sm font-semibold">{usd(p.price_usd)}</p>
            </Link>
          ))}
        </div>
      </section>

      {/*
        The support CTA is the most important link on this site — it is the one
        that reaches the classifier. It was a bordered box among other bordered
        boxes; giving it the only other photograph on the page makes it the
        second thing the eye lands on.
      */}
      <section className="relative mt-16 overflow-hidden rounded-lg">
        <div className="relative min-h-[15rem] w-full sm:min-h-[13rem]">
          <Image
            src={band.src}
            alt={band.alt}
            fill
            sizes="(min-width: 1152px) 1152px, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-pine/90 via-pine/70 to-pine/25" />
          <div className="relative flex h-full flex-col justify-center p-6 sm:p-8">
            <h2 className="font-bold text-bone">Something wrong with your gear?</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-bone/85">
              Tell us what happened and we will route it to the right person.
              Most things we can resolve without you having to chase us.
            </p>
            <Link
              href="/support"
              className="mt-4 inline-block w-fit rounded-md bg-bone px-4 py-2 text-sm font-medium text-pine hover:bg-white"
            >
              Contact support
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
