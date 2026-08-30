import Link from "next/link";
import ProductArt from "@/components/ProductArt";
import { ORDERS } from "@/lib/orders";
import { getProduct, usd } from "@/lib/products";

export const metadata = { title: "Your orders | Northwind Outfitters" };

const STATUS: Record<string, { label: string; className: string }> = {
  delivered: {
    label: "Delivered",
    className: "bg-spruce/20 text-pine",
  },
  in_transit: {
    label: "In transit",
    className: "bg-pine/12 text-pine",
  },
  processing: {
    label: "Processing",
    className: "bg-ember/15 text-ember",
  },
};

export default function OrdersPage() {
  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/50">
        Signed in as Dana
      </p>
      <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight">
        Your orders
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-pine/70">
        There are no accounts here &mdash; everyone who visits sees the same
        three fixtures the triage service looks up. Pick a piece of gear and
        file about it; that is how a ticket enters the course story.
      </p>

      <div className="mt-8 space-y-5">
        {ORDERS.map((o) => {
          const status = STATUS[o.status];
          return (
            <div
              key={o.order_id}
              className="rounded-lg border border-pine/15 bg-white/40 p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{o.order_id}</p>
                  <p className="mt-0.5 text-xs text-pine/60">
                    Placed {o.placed_at}
                    {o.delivered_at ? ` · delivered ${o.delivered_at}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{usd(o.total_usd)}</p>
                  <span
                    className={`mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>
              </div>

              <ul className="mt-4 space-y-3">
                {o.items.map((it) => {
                  const product = getProduct(it.slug);
                  return (
                    <li key={it.slug} className="flex items-center gap-3">
                      {product ? (
                        <Link
                          href={`/products/${it.slug}`}
                          className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-md"
                        >
                          <ProductArt
                            product={product}
                            className="h-full w-full !rounded-md"
                            sizes="56px"
                          />
                        </Link>
                      ) : (
                        <div className="h-14 w-14 shrink-0 rounded-md bg-pine/10" />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/products/${it.slug}`}
                          className="text-sm font-medium hover:text-spruce"
                        >
                          {it.qty} &times; {it.name}
                        </Link>
                        <p className="font-mono text-xs text-pine/55">
                          {usd(it.price_usd)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <Link
                  href={`/support?order=${o.order_id}`}
                  className="rounded-md bg-pine px-3.5 py-1.5 text-bone hover:bg-spruce"
                >
                  Get help with this order
                </Link>
                {o.tracking && (
                  <span className="font-mono text-xs text-pine/55">
                    {o.tracking}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
