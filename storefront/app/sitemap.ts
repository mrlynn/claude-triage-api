import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/links";
import { INDEXED_PATHS } from "@/lib/seo";

/*
 * No lastModified: the honest value is per-page git history, and stamping
 * every URL with the build time tells crawlers everything changed on every
 * deploy, which teaches them to ignore the field.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXED_PATHS.map((path) => ({ url: `${SITE_URL}${path === "/" ? "" : path}` }));
}
