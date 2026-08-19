import Link from "next/link";
import { PRODUCTS, usd } from "@/lib/products";
import ProductArt from "@/components/ProductArt";

export default function Home() {
  const featured = PRODUCTS.slice(0, 3);
  return (
    <>
      <section className="mb-14">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight max-w-3xl leading-[1.05]">
          Gear that outlasts the trip.
        </h1>
        <p className="mt-4 max-w-xl text-pine/75 leading-relaxed">
          Technical shells, packs, bottles and shelter, built in the mountain
          west and guaranteed for the life of the gear. If it fails because we
          made it wrong, we replace it. No window, no receipt hunt.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/products"
            className="rounded-md bg-pine px-5 py-2.5 text-bone text-sm font-medium hover:bg-spruce"
          >
            Shop everything
          </Link>
          <Link
            href="/orders"
            className="rounded-md border border-pine/25 px-5 py-2.5 text-sm font-medium hover:border-pine"
          >
            Your orders
          </Link>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-xl font-bold">Featured</h2>
          <Link href="/products" className="text-sm text-spruce hover:underline">
            All products
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => (
            <Link key={p.slug} href={`/products/${p.slug}`} className="group">
              <ProductArt product={p} className="aspect-[4/3] mb-3" />
              <h3 className="font-semibold group-hover:text-spruce">{p.name}</h3>
              <p className="text-sm text-pine/65 mt-0.5">{p.blurb}</p>
              <p className="text-sm font-semibold mt-1.5">{usd(p.price_usd)}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-lg border border-pine/15 p-6 bg-white/40">
        <h2 className="font-bold">Something wrong with your gear?</h2>
        <p className="mt-1.5 text-sm text-pine/75 max-w-2xl leading-relaxed">
          Tell us what happened and we will route it to the right person. Most
          things we can resolve without you having to chase us.
        </p>
        <Link
          href="/support"
          className="mt-4 inline-block rounded-md bg-pine px-4 py-2 text-bone text-sm hover:bg-spruce"
        >
          Contact support
        </Link>
      </section>
    </>
  );
}
