import { requireAdmin } from "@/lib/admin";
import { overview, parseWindow } from "@/lib/adminData";
import { AdminShell, Breakdown, DailyBars, Meter, Panel, Stat, Table, ago, ms, num, pct, usd } from "./ui";

const FUNDING_LABEL: Record<string, string> = {
  house: "House (anonymous or BYOK off)",
  trial: "Free credit",
  byok: "Learner's own key",
};

const GATE_LABEL: Record<string, string> = {
  sign_in_required: "Asked to sign in",
  trial_exhausted: "Credit used up",
  house_budget: "Daily house budget hit",
  rate_limited: "Rate limited",
  key_invalid: "Key rejected",
  key_quota: "Key over quota",
  store_error: "Store unavailable",
  unconfigured: "Unconfigured",
};

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await requireAdmin();
  const days = parseWindow((await searchParams).days);
  const o = await overview(days);
  const t = o.totals;

  return (
    <AdminShell
      admin={admin}
      path="/admin"
      days={days}
      title="Overview"
      subtitle={
        o.loggingSince ? (
          <>
            Per-call logging started {ago(o.loggingSince)}. Spend before that is only in the daily counters on /ops.
            Rows expire after 90 days.
          </>
        ) : (
          <>No AI calls logged yet. Rows appear here as soon as anyone uses a paid surface.</>
        )
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Spend" value={usd(t.costMicros)} note={`${usd(t.calls ? t.costMicros / t.calls : 0)} per call`} />
        <Stat label="AI calls" value={num(t.calls)} note={`${num(t.anonymousCalls)} anonymous`} />
        <Stat label="Active learners" value={num(t.activeUsers)} note={`${num(o.users.new)} new sign-ins`} />
        <Stat label="Error rate" value={pct(t.errors, t.calls)} note={`p50 ${ms(t.p50Ms)} · p95 ${ms(t.p95Ms)}`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Spend per day" note="UTC days. Hover a bar for the figure.">
          <DailyBars rows={o.daily} value={(i) => o.daily[i].costMicros} format={usd} label="Spend per day" />
        </Panel>
        <Panel title="Calls per day" note="Failed calls in red, inside each bar.">
          <DailyBars
            rows={o.daily}
            value={(i) => o.daily[i].calls}
            overlay={(i) => o.daily[i].errors}
            format={num}
            label="Calls per day"
          />
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Right now">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-xs">
            <dt className="text-pine/65">Signed-in learners</dt>
            <dd className="text-right font-mono">
              {num(o.live.signedInUsers)} <span className="text-pine/45">({num(o.live.sessions)} sessions)</span>
            </dd>
            <dt className="text-pine/65">Keys stored</dt>
            <dd className="text-right font-mono">{num(o.live.keys)}</dd>
            <dt className="text-pine/65">House budget today</dt>
            <dd className="text-right font-mono">
              {usd(o.live.houseSpentMicros)} / {usd(o.live.houseBudgetMicros)}
            </dd>
            <dd className="col-span-2 -mt-1">
              <Meter value={o.live.houseSpentMicros} of={o.live.houseBudgetMicros} wide />
            </dd>
            <dt className="text-pine/65">Credit grants today</dt>
            <dd className="text-right font-mono">
              {num(o.live.grantsToday)} / {num(o.live.grantsDaily)}
            </dd>
            <dd className="col-span-2 -mt-1">
              <Meter value={o.live.grantsToday} of={o.live.grantsDaily} wide />
            </dd>
          </dl>
        </Panel>
        <Panel title="Who paid">
          <Breakdown
            rows={o.funding.map((f) => ({
              label: FUNDING_LABEL[f.kind] ?? f.kind,
              value: f.costMicros,
              display: usd(f.costMicros),
              note: `${num(f.calls)} calls`,
            }))}
          />
        </Panel>
        <Panel title="Where it went">
          <Breakdown
            rows={o.surfaces.map((s) => ({
              label: s.surface,
              value: s.costMicros,
              display: usd(s.costMicros),
              note: `${num(s.calls)}`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Learners, all time" note="The users collection. A learner is deleted 180 days after they were last seen.">
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-xs">
            <dt className="text-pine/65">Accounts</dt>
            <dd className="text-right font-mono">{num(o.users.total)}</dd>
            <dt className="text-pine/65">Seen in window</dt>
            <dd className="text-right font-mono">{num(o.users.seen)}</dd>
            <dt className="text-pine/65">Free credit granted</dt>
            <dd className="text-right font-mono">{usd(o.users.grantMicros)}</dd>
            <dt className="text-pine/65">Free credit used</dt>
            <dd className="text-right font-mono">
              {usd(o.users.spentMicros)} <span className="text-pine/45">({pct(o.users.spentMicros, o.users.grantMicros)})</span>
            </dd>
            <dt className="text-pine/65">Spent on learners&apos; own keys</dt>
            <dd className="text-right font-mono">{usd(o.users.byokSpentMicros)}</dd>
          </dl>
        </Panel>
        <Panel title="Refused at the gate" note="Requests the funding check turned away before any model call. Counted per day, no identity.">
          <Table
            rows={o.gates}
            rowKey={(g) => g.code}
            empty="Nobody was refused in this window."
            columns={[
              { label: "Reason", cell: (g) => GATE_LABEL[g.code] ?? g.code },
              { label: "Count", cell: (g) => num(g.count), align: "right" },
            ]}
          />
        </Panel>
      </div>
    </AdminShell>
  );
}
