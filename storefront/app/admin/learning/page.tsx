import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { learning, parseWindow } from "@/lib/adminData";
import { LabTable } from "../labs";
import { AdminShell, Breakdown, Panel, Stat, Table, ago, num, pct, userHref } from "../ui";

const STEP_LABEL: Record<string, string> = {
  tutor_plan: "Made a plan",
  tutor_lesson: "Opened a lesson",
  tutor_hint: "Asked for a hint",
  tutor_review: "Submitted an attempt",
};

export default async function AdminLearning({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await requireAdmin();
  const days = parseWindow((await searchParams).days);
  const l = await learning(days);

  return (
    <AdminShell
      admin={admin}
      path="/admin/learning"
      days={days}
      title="Learning"
      subtitle="Tutor review outcomes: the verdict, how many rubric criteria were met, and whether each planted starter mistake was fixed. The attempt, the feedback text and the rubric wording are not stored. Course progress stays in the learner's browser and is not visible here."
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Reviews" value={num(l.totals.reviews)} note={`${num(l.totals.anonymous)} from anonymous visitors`} />
        <Stat label="Pass rate" value={pct(l.totals.passes, l.totals.reviews)} note={`${num(l.totals.passes)} passed`} />
        <Stat label="Learners reviewed" value={num(l.totals.learners)} note="signed in, at least one attempt" />
        <Stat
          label="Attempts per learner"
          value={l.totals.learners ? ((l.totals.reviews - l.totals.anonymous) / l.totals.learners).toFixed(1) : "—"}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Tutor funnel" note="Signed-in learners who completed each step at least once in the window. Successful calls only.">
          <Breakdown
            labelWidth="9.5rem"
            rows={l.funnel.map((f) => ({
              label: STEP_LABEL[f.step] ?? f.step,
              value: f.learners,
              display: num(f.learners),
              note: `${num(f.calls)} calls`,
            }))}
          />
        </Panel>
        <Panel title="Starter mistakes" note="How often a planted mistake was fixed, judged by the criterion it sits on. Least fixed is where the lab is not landing.">
          <Table
            rows={[...l.mistakes].sort((a, b) => a.fixed / a.attempts - b.fixed / b.attempts)}
            rowKey={(m) => m.id}
            empty="No attempts started from a starter in this window."
            columns={[
              { label: "Mistake", cell: (m) => <code className="text-[11px]">{m.id}</code> },
              { label: "Lab", cell: (m) => m.labId },
              { label: "Attempts", cell: (m) => num(m.attempts), align: "right" },
              { label: "Fixed", cell: (m) => pct(m.fixed, m.attempts), align: "right" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="By lab" note="A review counts toward every lab its lesson teaches.">
        <LabTable rows={l.labs} />
      </Panel>

      <Panel title="Learners" note="Most recently active first, up to 100.">
        <Table
          rows={l.learners}
          rowKey={(r) => r.userId}
          empty="No signed-in learner has submitted an attempt in this window."
          columns={[
            {
              label: "Learner",
              cell: (r) => (
                <Link className="underline decoration-pine/30 hover:decoration-pine" href={userHref(r.userId, days)}>
                  {r.login}
                </Link>
              ),
            },
            { label: "Last attempt", cell: (r) => <span title={r.lastAt}>{ago(r.lastAt)}</span> },
            { label: "Labs", cell: (r) => num(r.labs), align: "right" },
            { label: "Reviews", cell: (r) => num(r.reviews), align: "right" },
            { label: "Passes", cell: (r) => num(r.passes), align: "right" },
            { label: "Pass rate", cell: (r) => pct(r.passes, r.reviews), align: "right" },
          ]}
        />
      </Panel>
    </AdminShell>
  );
}
