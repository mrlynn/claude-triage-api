import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { FEEDBACK_LIST_LIMIT, feedbackView, parseFeedbackFilter, parseWindow, type FeedbackFilter } from "@/lib/adminData";
import { LABS_URL } from "@/lib/links";
import { AdminShell, Breakdown, Panel, Stat, Table, num, pct } from "../ui";
import { FeedbackList } from "./FeedbackList";

type Query = Record<string, string | string[] | undefined>;

function FilterLinks({
  label,
  field,
  options,
  filter,
  days,
}: {
  label: string;
  field: keyof FeedbackFilter;
  options: { value: string; label: string }[];
  filter: FeedbackFilter;
  days: number;
}) {
  const href = (value: string) => {
    const next = { ...filter, [field]: field === "commentsOnly" ? value === "1" : value };
    const q = new URLSearchParams({
      days: String(days),
      status: next.status,
      surface: next.surface,
      rating: next.rating,
      ...(next.commentsOnly ? { comments: "1" } : {}),
    });
    return `/admin/feedback?${q}`;
  };
  const current = field === "commentsOnly" ? (filter.commentsOnly ? "1" : "0") : String(filter[field]);
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="mr-1 text-pine/50">{label}</span>
      {options.map((o) => (
        <Link
          key={o.value}
          href={href(o.value)}
          className={`rounded px-2 py-0.5 font-semibold ${o.value === current ? "bg-pine text-bone" : "text-pine/60 hover:bg-pine/10"}`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export default async function AdminFeedback({ searchParams }: { searchParams: Promise<Query> }) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const days = parseWindow(query.days);
  const filter = parseFeedbackFilter(query);
  const f = await feedbackView(days, filter);
  const rated = f.totals.up + f.totals.down;

  return (
    <AdminShell
      admin={admin}
      path="/admin/feedback"
      days={days}
      title="Feedback"
      subtitle="Ratings and comments from course pages, the Tutor, Ask Northwind and the feedback form. Comments are scrubbed of emails, phone numbers, card numbers and API keys before storage, and everything expires after 90 days. The content being rated is not stored."
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Feedback" value={num(f.totals.items)} note={`${num(f.totals.comments)} with a comment`} />
        <Stat label="Helpful" value={pct(f.totals.up, rated)} note={`${num(f.totals.up)} 👍 · ${num(f.totals.down)} 👎`} />
        <Stat label="Open" value={num(f.totals.open)} note="not yet resolved, in this window" />
        <Stat label="Top reason" value={f.reasons[0]?.reason.replace(/_/g, " ") ?? "—"} note={f.reasons[0] ? `${num(f.reasons[0].count)} times` : undefined} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="By surface">
          <Table
            rows={f.surfaces}
            rowKey={(r) => r.surface}
            empty="No feedback in this window."
            columns={[
              { label: "Surface", cell: (r) => r.surface },
              { label: "👍", cell: (r) => num(r.up), align: "right" },
              { label: "👎", cell: (r) => num(r.down), align: "right" },
              { label: "Helpful", cell: (r) => pct(r.up, r.up + r.down), align: "right" },
              { label: "Comments", cell: (r) => num(r.comments), align: "right" },
            ]}
          />
        </Panel>
        <Panel title="Pages people found unhelpful" note="Course pages, most 👎 first.">
          <Table
            rows={f.pages}
            rowKey={(r) => r.path}
            empty="No page ratings in this window."
            columns={[
              {
                label: "Page",
                cell: (r) => (
                  <a className="underline decoration-pine/25" href={`${LABS_URL}${r.path}`} target="_blank" rel="noreferrer">
                    {r.path.replace(/^\/docs\//, "")}
                  </a>
                ),
              },
              { label: "👎", cell: (r) => num(r.down), align: "right" },
              { label: "👍", cell: (r) => num(r.up), align: "right" },
            ]}
          />
        </Panel>
        <Panel title="Reasons">
          <Breakdown
            labelWidth="8.5rem"
            rows={f.reasons.map((r) => ({ label: r.reason.replace(/_/g, " "), value: r.count, display: num(r.count) }))}
          />
        </Panel>
      </div>

      <Panel title="By lab" note="Every surface that knows its lab: the lab's pages and the Tutor sessions teaching it.">
        <Table
          rows={f.labs}
          rowKey={(r) => r.labId}
          empty="No lab-specific feedback in this window."
          columns={[
            { label: "Lab", cell: (r) => r.title },
            { label: "👍", cell: (r) => num(r.up), align: "right" },
            { label: "👎", cell: (r) => num(r.down), align: "right" },
            { label: "Helpful", cell: (r) => pct(r.up, r.up + r.down), align: "right" },
          ]}
        />
      </Panel>

      <Panel title="Inbox" note={`Newest first, up to ${FEEDBACK_LIST_LIMIT}. A comment added later reopens resolved feedback.`}>
        <div className="mb-3 flex flex-col gap-1.5">
          <FilterLinks
            label="Status"
            field="status"
            filter={filter}
            days={days}
            options={[
              { value: "new", label: "Open" },
              { value: "resolved", label: "Resolved" },
              { value: "all", label: "All" },
            ]}
          />
          <FilterLinks
            label="Surface"
            field="surface"
            filter={filter}
            days={days}
            options={[
              { value: "all", label: "All" },
              { value: "page", label: "Pages" },
              { value: "tutor_lesson", label: "Lessons" },
              { value: "tutor_hint", label: "Hints" },
              { value: "tutor_review", label: "Reviews" },
              { value: "assistant", label: "Ask Northwind" },
              { value: "general", label: "General" },
            ]}
          />
          <FilterLinks
            label="Rating"
            field="rating"
            filter={filter}
            days={days}
            options={[
              { value: "all", label: "All" },
              { value: "down", label: "👎" },
              { value: "up", label: "👍" },
            ]}
          />
          <FilterLinks
            label="Comments"
            field="commentsOnly"
            filter={filter}
            days={days}
            options={[
              { value: "0", label: "Any" },
              { value: "1", label: "With a comment" },
            ]}
          />
        </div>
        <FeedbackList items={f.items} days={days} />
      </Panel>
    </AdminShell>
  );
}
