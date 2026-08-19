/**
 * A deliberately boring fake back office.
 *
 * TEACHING NOTE: keeping the "business system" trivial and synchronous keeps
 * the labs about the Claude API. In production these functions are your CRM,
 * your OMS, and your search index — the tool *contract* is what matters, not
 * what sits behind it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ESM has no __dirname. Deriving it from import.meta.url makes file loading
// independent of the process working directory.
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "..", "data");

export interface OrderItem {
  name: string;
  qty: number;
  price_usd: number;
  final_sale: boolean;
}

export interface Order {
  order_id: string;
  customer_email: string;
  placed_at: string;
  delivered_at: string | null;
  status: "processing" | "in_transit" | "delivered" | "cancelled";
  total_usd: number;
  shipping_method: "standard" | "expedited" | "overnight";
  tracking: string | null;
  items: OrderItem[];
}

export interface Customer {
  email: string;
  name: string;
  member_tier: "trail_club" | "none";
  member_since: string | null;
  lifetime_value_usd: number;
  refunds_last_30d_usd: number;
  prior_contacts_90d: number;
}

export const ORDERS: Order[] = JSON.parse(
  readFileSync(join(dataDir, "orders.json"), "utf8"),
);

export const CUSTOMERS: Customer[] = JSON.parse(
  readFileSync(join(dataDir, "customers.json"), "utf8"),
);

/** The full policy handbook. Large, stable, and reused on every request — the
 *  textbook candidate for a prompt-cache breakpoint. */
export const POLICY_HANDBOOK: string = readFileSync(
  join(dataDir, "policies.md"),
  "utf8",
);

export function findOrder(orderId: string): Order | undefined {
  const needle = orderId.trim().toUpperCase();
  return ORDERS.find((o) => o.order_id.toUpperCase() === needle);
}

export function findCustomer(email: string): Customer | undefined {
  const needle = email.trim().toLowerCase();
  return CUSTOMERS.find((c) => c.email.toLowerCase() === needle);
}

/**
 * Naive keyword search over the handbook's `## ` sections. Real systems use
 * embeddings; the lesson here is that a tool should return a *small, relevant*
 * slice rather than the whole corpus.
 */
export function searchPolicy(query: string, limit = 3): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);

  const sections = POLICY_HANDBOOK.split(/\n(?=## )/).filter((s) =>
    s.startsWith("## "),
  );

  const scored = sections.map((section) => {
    const haystack = section.toLowerCase();
    const score = terms.reduce(
      (acc, term) => acc + (haystack.split(term).length - 1),
      0,
    );
    return { section, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.section.trim());
}

/** Days between an ISO date and "today" as the service sees it. */
export function daysSince(isoDate: string, now = new Date()): number {
  const then = new Date(isoDate + "T00:00:00Z").getTime();
  return Math.floor((now.getTime() - then) / 86_400_000);
}
