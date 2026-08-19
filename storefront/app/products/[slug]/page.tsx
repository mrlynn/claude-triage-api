import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCTS, getProduct, usd } from "@/lib/products";
import ProductArt from "@/components/ProductArt";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  return (
    <>
      <Link href="/products" className="text-sm text-spruce hover:underline">
        &larr; All products
      </Link>

      <div className="mt-5 grid gap-10 lg:grid-cols-2">
        <ProductArt product={product} className="aspect-square" />

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {product.name}
          </h1>
          <p className="mt-2 text-2xl font-semibold">{usd(product.price_usd)}</p>
          {product.final_sale && (
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-ember">
              Final sale &mdash; not returnable
            </p>
          )}

          <p className="mt-5 leading-relaxed text-pine/80">{product.detail}</p>

          <dl className="mt-6 divide-y divide-pine/12 border-y border-pine/12 text-sm">
            {product.specs.map((s) => (
              <div key={s.label} className="flex justify-between gap-6 py-2.5">
                <dt className="text-pine/60">{s.label}</dt>
                <dd className="font-medium text-right">{s.value}</dd>
              </div>
            ))}
          </dl>

          {/* No cart. Deliberately. This is a scenario, not a shop. */}
          <div className="mt-6 rounded-md border border-pine/20 bg-white/50 p-4 text-sm">
            <p className="text-pine/70">
              Nothing here is for sale &mdash; Northwind is a fictional company
              built for a workshop. What you <em>can</em> do is file a support
              ticket about this product and watch it get triaged.
            </p>
            <Link
              href={`/support?product=${encodeURIComponent(product.name)}`}
              className="mt-3 inline-block rounded-md bg-pine px-4 py-2 text-bone hover:bg-spruce"
            >
              Report a problem with this product
            </Link>
          </div>

          <div className="mt-6 text-xs text-pine/60 leading-relaxed">
            <p className="font-semibold text-pine/80">Returns and warranty</p>
            <p className="mt-1">
              60 days for any reason, provided the item is resellable. Defective
              items have no return window under our lifetime workmanship
              guarantee. Return shipping is free on defects, wrong items, and
              any order over $75.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
