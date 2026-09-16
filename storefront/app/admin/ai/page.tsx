import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { aiAnalytics, parseWindow, type CallStats } from "@/lib/adminData";
import { recentCallColumns } from "../calls";
import { AdminShell, Panel, Table, ms, num, pct, tokens, userHref, usd } from "../ui";

/** Share of input tokens served from cache. Input here is all three input fields, never `input_tokens` alone. */
const cacheShare = (s: CallStats) => pct(s.cacheReadTokens, s.inputTokens + s.cacheReadTokens + s.cacheWriteTokens);

export default async function AdminAi({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await requireAdmin();
  const days = parseWindow((await searchParams).days);
  const a = await aiAnalytics(days);

  return (
    <AdminShell
      admin={admin}
      path="/admin/ai"
      days={days}
      title="AI calls"
      subtitle="Every call to Claude from a paid surface: which model answered, what it used, what it cost and how long the learner waited. Latency runs from the funding check to settlement. Prompts and replies are never stored."
    >
      <Panel title="By surface and model" note="Dearest first. A model the surface did not ask for means an alias resolved to something new (Decision 9).">
        <Table
          rows={a.byModel}
          rowKey={(r) => `${r.surface}:${r.model}`}
          empty="No calls in this window."
          columns={[
            { label: "Surface", cell: (r) => r.surface },
            { label: "Model", cell: (r) => r.model ?? <span className="text-pine/45">never reached</span> },
            { label: "Calls", cell: (r) => num(r.calls), align: "right" },
            { label: "Requests", cell: (r) => num(r.requests), align: "right" },
            { label: "Input", cell: (r) => tokens(r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens), align: "right" },
            { label: "Output", cell: (r) => tokens(r.outputTokens), align: "right" },
            { label: "Cached", cell: cacheShare, align: "right" },
            { label: "Cost", cell: (r) => usd(r.costMicros), align: "right" },
            { label: "Per call", cell: (r) => usd(r.calls ? r.costMicros / r.calls : 0), align: "right" },
            { label: "p50", cell: (r) => ms(r.p50Ms), align: "right" },
            { label: "p95", cell: (r) => ms(r.p95Ms), align: "right" },
            { label: "Errors", cell: (r) => pct(r.errors, r.calls), align: "right" },
          ]}
        />
      </Panel>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Errors" note="Codes only. http_401 on a learner's key deletes it; aborted on live is a visitor who kept typing.">
          <Table
            rows={a.errors}
            rowKey={(r) => `${r.surface}:${r.error}`}
            empty="No failed calls."
            columns={[
              { label: "Surface", cell: (r) => r.surface },
              { label: "Code", cell: (r) => r.error },
              { label: "Count", cell: (r) => num(r.count), align: "right" },
            ]}
          />
        </Panel>
        <Panel title="Stop reasons" note="max_tokens is a ceiling someone should look at; refusal is the model declining.">
          <Table
            rows={a.stopReasons}
            rowKey={(r) => r.stopReason}
            empty="No calls."
            columns={[
              { label: "Stop reason", cell: (r) => r.stopReason },
              { label: "Count", cell: (r) => num(r.count), align: "right" },
            ]}
          />
        </Panel>
        <Panel title="Top spenders">
          <Table
            rows={a.topSpenders}
            rowKey={(r) => r.userId}
            empty="No signed-in spend."
            columns={[
              {
                label: "Learner",
                cell: (r) => (
                  <Link className="underline decoration-pine/30 hover:decoration-pine" href={userHref(r.userId, days)}>
                    {r.login}
                  </Link>
                ),
              },
              { label: "Calls", cell: (r) => num(r.calls), align: "right" },
              { label: "Cost", cell: (r) => usd(r.costMicros), align: "right" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Most recent 50 calls">
        <Table rows={a.recent} rowKey={(c) => c.id} empty="No calls in this window." columns={recentCallColumns(days)} />
      </Panel>
    </AdminShell>
  );
}
