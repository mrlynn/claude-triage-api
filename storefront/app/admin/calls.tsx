import Link from "next/link";
import type { RecentCall, WindowDays } from "@/lib/adminData";
import { ago, ms, tokens, userHref, usd, type Column } from "./ui";

/** The recent-calls table, shared by the AI page and a learner's page (which drops the learner column). */
export function recentCallColumns(days: WindowDays, withUser = true): Column<RecentCall>[] {
  return [
    { label: "When", cell: (c) => <span title={c.at}>{ago(c.at)}</span> },
    ...(withUser
      ? [
          {
            label: "Learner",
            cell: (c: RecentCall) =>
              c.userId ? (
                <Link className="underline decoration-pine/30 hover:decoration-pine" href={userHref(c.userId, days)}>
                  {c.login ?? c.userId}
                </Link>
              ) : (
                <span className="text-pine/45">anonymous</span>
              ),
          },
        ]
      : []),
    { label: "Surface", cell: (c) => c.surface },
    { label: "Paid by", cell: (c) => c.funding },
    { label: "Model", cell: (c) => c.model ?? "—" },
    { label: "In / out", cell: (c) => `${tokens(c.inputTokens + c.cacheReadTokens)} / ${tokens(c.outputTokens)}`, align: "right" },
    { label: "Cost", cell: (c) => usd(c.costMicros), align: "right" },
    { label: "Latency", cell: (c) => ms(c.latencyMs), align: "right" },
    {
      label: "Outcome",
      cell: (c) =>
        c.error ? (
          <span className="font-semibold text-[#B3261E]">{c.error}</span>
        ) : (
          <span className="text-pine/60">{c.stopReason ?? "ok"}</span>
        ),
    },
  ];
}

