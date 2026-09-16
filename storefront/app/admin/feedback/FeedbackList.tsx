import Link from "next/link";
import type { FeedbackItem, WindowDays } from "@/lib/adminData";
import { LABS_URL, SITE_URL } from "@/lib/links";
import { setStatus } from "./actions";
import { Empty, ago, userHref } from "../ui";

const SURFACE_LABEL: Record<string, string> = {
  page: "Page",
  tutor_lesson: "Tutor lesson",
  tutor_hint: "Tutor hint",
  tutor_review: "Tutor review",
  assistant: "Ask Northwind",
  general: "General",
};

const pageUrl = (item: FeedbackItem) => (item.path ? `${item.site === "storefront" ? SITE_URL : LABS_URL}${item.path}` : null);

/**
 * Feedback items as cards rather than table rows: the comment is the point,
 * and a comment squeezed into a table cell is a comment nobody reads.
 * Comments are rendered as plain text — React escapes them — never as markdown.
 */
export function FeedbackList({ items, days, showUser = true }: { items: FeedbackItem[]; days: WindowDays; showUser?: boolean }) {
  if (items.length === 0) return <Empty>No feedback matches.</Empty>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((f) => {
        const url = pageUrl(f);
        return (
          <li
            key={f.id}
            className={`rounded-md border p-3 text-xs ${f.status === "new" ? "border-pine/25 bg-white/70" : "border-pine/10 bg-white/30 text-pine/70"}`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-base leading-none" aria-label={f.rating ?? "no rating"}>
                {f.rating === "up" ? "👍" : f.rating === "down" ? "👎" : "💬"}
              </span>
              <span className="font-semibold">{SURFACE_LABEL[f.surface] ?? f.surface}</span>
              {f.category && <span className="rounded bg-pine/10 px-1.5 py-px">{f.category}</span>}
              {f.labIds.map((l) => (
                <span key={l} className="rounded bg-spruce/15 px-1.5 py-px">
                  {l}
                </span>
              ))}
              {url && (
                <a className="truncate text-pine/60 underline decoration-pine/25" href={url} target="_blank" rel="noreferrer">
                  {f.path}
                </a>
              )}
              <span className="ml-auto whitespace-nowrap text-pine/50" title={f.createdAt}>
                {showUser &&
                  (f.userId ? (
                    <Link className="underline decoration-pine/30" href={userHref(f.userId, days)}>
                      {f.login ?? f.userId}
                    </Link>
                  ) : (
                    "anonymous"
                  ))}
                {showUser && " · "}
                {ago(f.createdAt)}
              </span>
            </div>
            {f.reasons.length > 0 && (
              <p className="mt-1.5 text-pine/60">{f.reasons.map((r) => r.replace(/_/g, " ")).join(" · ")}</p>
            )}
            {f.comment && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-pine">{f.comment}</p>}
            <form action={setStatus} className="mt-2">
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="status" value={f.status === "new" ? "resolved" : "new"} />
              <button
                type="submit"
                className="rounded border border-pine/20 px-2 py-0.5 text-[11px] font-semibold hover:border-pine/50"
              >
                {f.status === "new" ? "Mark resolved" : "Reopen"}
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
