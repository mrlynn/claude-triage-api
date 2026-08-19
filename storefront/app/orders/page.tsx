import Link from "next/link";
import { ORDERS } from "@/lib/orders";
import { usd } from "@/lib/products";

export const metadata = { title: "Your orders | Northwind Outfitters" };

const STATUS: Record<string, string> = {
  delivered: "Delivered",
  in_transit: "In transit",
  processing: "Processing",
};

export default function OrdersPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Your orders</h1>
      <p className="mt-2 text-sm text-pine/70">
        Signed in as Dana. There are no accounts here &mdash; everyone who
        visits sees the same three orders, and they are the same fixtures the
        triage service looks up.
      </p>

      <div className="mt-8 space-y-4">
        {ORDERS.map((o) => (
          <div
            key={o.order_id}
            className="rounded-lg border border-pine/15 bg-white/40 p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-semibold">{o.order_id}</p>
                <p className="text-xs text-pine/60 mt-0.5">
                  Placed {o.placed_at}
                  {o.delivered_at ? ` · delivered ${o.delivered_at}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{usd(o.total_usd)}</p>
                <p className="text-xs text-spruce font-medium">
                  {STATUS[o.status]}
                </p>
              </div>
            </div>

            <ul className="mt-3 space-y-1 text-sm">
              {o.items.map((it) => (
                <li key={it.slug} className="flex justify-between gap-4">
                  <Link
                    href={`/products/${it.slug}`}
                    className="hover:text-spruce"
                  >
                    {it.qty} &times; {it.name}
                  </Link>
                  <span className="text-pine/60">{usd(it.price_usd)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <Link
                href={`/support?order=${o.order_id}`}
                className="rounded-md bg-pine px-3.5 py-1.5 text-bone hover:bg-spruce"
              >
                Get help with this order
              </Link>
              {o.tracking && (
                <span className="self-center font-mono text-xs text-pine/55">
                  {o.tracking}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
