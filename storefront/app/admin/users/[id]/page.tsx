import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { parseWindow, userDetail } from "@/lib/adminData";
import { recentCallColumns } from "../../calls";
import { LabTable } from "../../labs";
import { AdminShell, Meter, Panel, Stat, Table, ago, ms, num, pct, usd } from "../../ui";

export default async function AdminUser({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const admin = await requireAdmin();
  const [{ id }, { days: rawDays }] = await Promise.all([params, searchParams]);
  const days = parseWindow(rawDays);
  const userId = decodeURIComponent(id);
  const detail = await userDetail(userId, days);
  if (!detail) notFound();
  const { user } = detail;

  const calls = detail.surfaces.reduce((a, s) => a + s.calls, 0);
  const cost = detail.surfaces.reduce((a, s) => a + s.costMicros, 0);
  const { total: reviews, passes } = detail.reviews;
  const githubId = user.userId.replace(/^gh:/, "");

  return (
    <AdminShell
      admin={admin}
      path={`/admin/users/${encodeURIComponent(user.userId)}`}
      days={days}
      title={user.login}
      subtitle={
        <>
          GitHub id {githubId} ·{" "}
          <a className="underline" href={`https://github.com/${encodeURIComponent(user.login)}`} rel="noreferrer" target="_blank">
            profile
          </a>{" "}
          · joined {ago(user.createdAt)} · last seen {ago(user.lastSeenAt)} · {num(detail.sessions)} active session
          {detail.sessions === 1 ? "" : "s"} · <Link className="underline" href={`/admin/users?days=${days}`}>all users</Link>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Free credit used"
          value={user.grantMicros > 0 ? pct(Math.min(user.spentMicros, user.grantMicros), user.grantMicros) : "no grant"}
          note={`${usd(Math.min(user.spentMicros, user.grantMicros))} of ${usd(user.grantMicros)}, lifetime`}
        />
        <Stat label="Own key" value={user.hasKey ? "active" : "none"} note={`${usd(user.byokSpentMicros)} spent on it, lifetime`} />
        <Stat label="AI calls" value={num(calls)} note={`${usd(cost)} in this window`} />
        <Stat label="Tutor reviews" value={num(reviews)} note={reviews ? `${pct(passes, reviews)} passed` : "none in this window"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="How they use it">
          <Table
            rows={detail.surfaces}
            rowKey={(s) => s.surface}
            empty="No AI calls in this window."
            columns={[
              { label: "Surface", cell: (s) => s.surface },
              { label: "Calls", cell: (s) => num(s.calls), align: "right" },
              { label: "Cost", cell: (s) => usd(s.costMicros), align: "right" },
              { label: "p50", cell: (s) => ms(s.p50Ms), align: "right" },
              { label: "Errors", cell: (s) => pct(s.errors, s.calls), align: "right" },
            ]}
          />
        </Panel>
        <Panel title="Recent reviews" note="The latest 30 in the window.">
          <Table
            rows={detail.recentReviews}
            rowKey={(r) => `${r.at}:${r.labIds.join(",")}`}
            empty="No Tutor reviews in this window."
            columns={[
              { label: "When", cell: (r) => <span title={r.at}>{ago(r.at)}</span> },
              { label: "Labs", cell: (r) => r.labIds.join(", ") || "—" },
              {
                label: "Verdict",
                cell: (r) => <span className={r.verdict === "pass" ? "font-semibold text-[#036A4F]" : "text-pine/70"}>{r.verdict}</span>,
              },
              {
                label: "Criteria met",
                cell: (r) => (
                  <>
                    <Meter value={r.met} of={r.criteria} invert warnAt={0.5} /> {r.met}/{r.criteria}
                  </>
                ),
              },
            ]}
          />
        </Panel>
      </div>

      <Panel title="By lab">
        <LabTable rows={detail.labs} showLearners={false} />
      </Panel>

      <Panel title="Recent calls">
        <Table rows={detail.recentCalls} rowKey={(c) => c.id} empty="No AI calls in this window." columns={recentCallColumns(days, false)} />
      </Panel>
    </AdminShell>
  );
}
