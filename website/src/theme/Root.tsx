import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/react";
import AssistantDock from "@site/src/components/AssistantDock";

/**
 * Wraps every page. Docusaurus has no root layout to edit, so `theme/Root` is
 * the supported place to mount something that must run everywhere.
 *
 * Page-view analytics only, so "is anyone using the course" has an answer.
 * Vercel's own rather than hand-rolled: a custom dashboard would mean a store,
 * a schema and a UI to keep alive, competing with something that already
 * exists and is better. No cookies, no cross-site identifier.
 *
 * It no-ops off Vercel, so `npm start` locally sends nothing.
 */
export default function Root({ children }: { children: ReactNode }): ReactNode {
  return (
    <>
      {children}
      <Analytics />
      <AssistantDock />
    </>
  );
}
