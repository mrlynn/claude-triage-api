/**
 * A fake order history, seeded from the same fixtures the triage API reads.
 * No accounts, no auth. Everyone who visits is Dana.
 */
export interface OrderLine {
  name: string;
  slug: string;
  qty: number;
  price_usd: number;
}

export interface Order {
  order_id: string;
  placed_at: string;
  delivered_at: string | null;
  status: "processing" | "in_transit" | "delivered";
  total_usd: number;
  tracking: string | null;
  items: OrderLine[];
}

export const ORDERS: Order[] = [
  {
    order_id: "NW-48211",
    placed_at: "2026-07-28",
    delivered_at: "2026-08-03",
    status: "delivered",
    total_usd: 218.4,
    tracking: "1Z999AA10123456784",
    items: [
      { name: "Ridgeline 3L Shell Jacket", slug: "ridgeline-3l-shell", qty: 1, price_usd: 189 },
      { name: "Merino Liner Gloves", slug: "merino-liner-gloves", qty: 1, price_usd: 29.4 },
    ],
  },
  {
    order_id: "NW-52044",
    placed_at: "2026-08-15",
    delivered_at: null,
    status: "processing",
    total_usd: 640,
    tracking: null,
    items: [
      { name: "Summit Expedition Tent 4P", slug: "summit-expedition-tent-4p", qty: 1, price_usd: 640 },
    ],
  },
  {
    order_id: "NW-33780",
    placed_at: "2026-02-14",
    delivered_at: "2026-02-20",
    status: "delivered",
    total_usd: 62.5,
    tracking: "1Z999AA10555512345",
    items: [
      { name: "Basecamp Insulated Bottle 32oz", slug: "basecamp-bottle-32", qty: 1, price_usd: 42.5 },
      { name: "Ridge Beanie", slug: "clearance-beanie", qty: 1, price_usd: 20 },
    ],
  },
];

export function getOrder(id: string): Order | undefined {
  return ORDERS.find((o) => o.order_id.toUpperCase() === id.trim().toUpperCase());
}
