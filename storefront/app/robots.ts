import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/links";

/**
 * Only the API and admin are off limits. Demo pages that should not rank
 * (products, orders, the queue) carry a noindex instead — a crawler has to be
 * allowed to fetch a page to see that it should not index it, so disallowing
 * them here would leave them indexable from inbound links.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
