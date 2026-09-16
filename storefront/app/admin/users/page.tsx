import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { USER_LIST_LIMIT, parseWindow, userList } from "@/lib/adminData";
import { AdminShell, Meter, Panel, Table, ago, num, pct, userHref, usd } from "../ui";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await requireAdmin();
  const days = parseWindow((await searchParams).days);
  const users = await userList(days);
  const active = users.filter((u) => u.calls > 0).length;

  return (
    <AdminShell
      admin={admin}
      path="/admin/users"
      days={days}
      title="Users"
      subtitle={`Everyone who has signed in with GitHub, most recently seen first (up to ${USER_LIST_LIMIT}). Calls, spend and reviews are for the selected window; credit is lifetime. A GitHub id and login is all that is stored about a person.`}
    >
      <Panel title={`${num(users.length)} learners`} note={`${num(active)} made an AI call in this window.`}>
        <Table
          rows={users}
          rowKey={(u) => u.userId}
          empty="Nobody has signed in yet. Sign-in needs BYOK_MODE set to shadow or enforce."
          columns={[
            {
              label: "Learner",
              cell: (u) => (
                <Link className="font-semibold underline decoration-pine/30 hover:decoration-pine" href={userHref(u.userId, days)}>
                  {u.login}
                </Link>
              ),
            },
            { label: "Joined", cell: (u) => <span title={u.createdAt}>{ago(u.createdAt)}</span> },
            { label: "Last seen", cell: (u) => <span title={u.lastSeenAt}>{ago(u.lastSeenAt)}</span> },
            {
              label: "Free credit",
              cell: (u) =>
                u.grantMicros > 0 ? (
                  <>
                    <Meter value={u.spentMicros} of={u.grantMicros} /> {usd(Math.min(u.spentMicros, u.grantMicros))} /{" "}
                    {usd(u.grantMicros)}
                  </>
                ) : (
                  <span className="text-pine/45">no grant</span>
                ),
            },
            { label: "Own key", cell: (u) => (u.hasKey ? "active" : u.byokSpentMicros > 0 ? "used" : "—") },
            { label: "Own-key spend", cell: (u) => usd(u.byokSpentMicros), align: "right" },
            { label: "Calls", cell: (u) => num(u.calls), align: "right" },
            { label: "Spend", cell: (u) => usd(u.costMicros), align: "right" },
            { label: "Surfaces", cell: (u) => <span className="text-pine/60">{u.surfaces.join(", ") || "—"}</span> },
            { label: "Reviews", cell: (u) => num(u.reviews), align: "right" },
            { label: "Pass rate", cell: (u) => pct(u.passes, u.reviews), align: "right" },
          ]}
        />
      </Panel>
    </AdminShell>
  );
}
