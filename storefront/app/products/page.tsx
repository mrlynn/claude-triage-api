import Link from "next/link";
import { PRODUCTS, usd } from "@/lib/products";
import ProductArt from "@/components/ProductArt";

export const metadata = { title: "Shop | Northwind Outfitters" };

export default function ProductsPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Everything</h1>
      <p className="mt-2 text-pine/70 text-sm">
        {PRODUCTS.length} products. All covered by the lifetime workmanship
        guarantee.
      </p>
      <div className="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
        {PRODUCTS.map((p) => (
          <Link key={p.slug} href={`/products/${p.slug}`} className="group">
            <ProductArt product={p} className="aspect-square mb-3" />
            <h2 className="font-semibold text-sm group-hover:text-spruce">
              {p.name}
            </h2>
            <p className="text-xs text-pine/60 mt-0.5">{p.blurb}</p>
            <p className="text-sm font-semibold mt-1.5">
              {usd(p.price_usd)}
              {p.final_sale && (
                <span className="ml-2 text-[10px] uppercase tracking-wide text-ember font-bold">
                  Final sale
                </span>
              )}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
