import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The platform admin console. Not linked from anywhere, not indexed, and a 404
 * for anyone who is not in ADMIN_GITHUB_IDS — see `lib/admin.ts`. This layout
 * deliberately checks nothing: each page does, because a layout's check does
 * not re-run when navigating between the pages under it.
 */
export const metadata: Metadata = {
  title: "Admin | Northwind Outfitters",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
