import Link from "next/link";
import type { ReactNode } from "react";
import type { Admin } from "@/lib/admin";
import { WINDOWS, type WindowDays } from "@/lib/adminData";
import { PALETTE } from "@/lib/palette";

/**
 * The admin console's shared pieces. Server components only: nothing on these
 * pages needs to run in the browser, so none of it is shipped there.
 */

// ---- formatting ----------------------------------------------------------------------

export const usd = (micros: number) => {
  const v = micros / 1_000_000;
  if (v === 0) return "$0";
  if (Math.abs(v) < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const num = (v: number) => v.toLocaleString("en-US");
export const tokens = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 10_000 ? `${Math.round(v / 1000)}k` : num(v);
/** A rate with no denominator is unknown, not zero. */
export const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");
export const ms = (v: number | null) => (v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);

export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export const userHref = (userId: string, days: WindowDays) => `/admin/users/${encodeURIComponent(userId)}?days=${days}`;

// ---- shell ------------------------------------------------------------------------------

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/ai", label: "AI calls" },
  { href: "/admin/learning", label: "Learning" },
] as const;

export function AdminShell({
  admin,
  path,
  days,
  title,
  subtitle,
  children,
}: {
  admin: Admin;
  path: string;
  days: WindowDays;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/50">
            Platform admin · signed in as {admin.login}
          </p>
          <nav aria-label="Window" className="flex gap-1 text-xs">
            {WINDOWS.map((w) => (
              <Link
                key={w}
                href={`${path}?days=${w}`}
                className={`rounded px-2 py-1 font-semibold ${
                  w === days ? "bg-pine text-bone" : "text-pine/60 hover:bg-pine/10"
                }`}
              >
                {w === 1 ? "24h" : `${w}d`}
              </Link>
            ))}
          </nav>
        </div>
        <nav aria-label="Admin" className="flex flex-wrap gap-1 border-b border-pine/15">
          {TABS.map((t) => {
            const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={`${t.href}?days=${days}`}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
                  active ? "border-ember text-pine" : "border-transparent text-pine/55 hover:text-pine"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm text-pine/65">{subtitle}</p>}
        </div>
      </header>
      {children}
    </div>
  );
}

// ---- blocks -------------------------------------------------------------------------------

export function Panel({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-pine/15 bg-white/55 p-4">
      <h2 className="text-sm font-bold">{title}</h2>
      {note && <p className="mt-0.5 text-xs leading-relaxed text-pine/60">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-pine/15 bg-white/55 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-pine/50">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums leading-none">{value}</p>
      {note && <p className="mt-1.5 text-[11px] leading-tight text-pine/55">{note}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-pine/55">{children}</p>;
}

export interface Column<T> {
  label: string;
  cell: (row: T) => ReactNode;
  align?: "right";
}

export function Table<T>({ rows, columns, rowKey, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; empty: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-pine/15 text-left text-[11px] uppercase tracking-wide text-pine/50">
            {columns.map((c) => (
              <th key={c.label} className={`whitespace-nowrap px-2 py-1.5 font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-pine/8 last:border-0">
              {columns.map((c) => (
                <td
                  key={c.label}
                  className={`whitespace-nowrap px-2 py-1.5 ${c.align === "right" ? "text-right font-mono tabular-nums" : ""}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A proportion as a bar, for pass rates and budget use. Red past `warnAt`. */
export function Meter({
  value,
  of,
  warnAt = 0.8,
  invert = false,
  wide = false,
}: {
  value: number;
  of: number;
  warnAt?: number;
  /** For rates where low is bad, such as a pass rate. */
  invert?: boolean;
  /** Fill the container instead of a fixed inline width. */
  wide?: boolean;
}) {
  const ratio = of > 0 ? Math.min(1, value / of) : 0;
  const bad = invert ? ratio < 1 - warnAt : ratio >= warnAt;
  return (
    <span
      className={`${wide ? "block w-full" : "inline-block w-24"} h-2 overflow-hidden rounded-sm bg-pine/10 align-middle`}
      title={pct(value, of)}
    >
      <span
        className="block h-full"
        style={{ width: `${ratio * 100}%`, background: bad ? PALETTE.status.critical : PALETTE.sequential[2] }}
      />
    </span>
  );
}

/**
 * Daily bars, drawn on the server. One series with an optional error overlay,
 * so it stays inside the three-colour limit the ops charts hold to.
 */
export function DailyBars({
  rows,
  value,
  overlay,
  format,
  label,
}: {
  rows: { date: string }[];
  value: (i: number) => number;
  overlay?: (i: number) => number;
  format: (v: number) => string;
  label: string;
}) {
  const W = 600;
  const H = 120;
  const n = rows.length;
  const values = rows.map((_, i) => value(i));
  const max = Math.max(1e-9, ...values);
  const gap = n > 40 ? 1 : 2;
  const bw = Math.max(1, W / n - gap);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="h-auto w-full" role="img" aria-label={`${label}, ${format(total)} in total`}>
        <line x1={0} x2={W} y1={H} y2={H} stroke={PALETTE.grid} />
        {values.map((v, i) => {
          const h = (v / max) * (H - 4);
          const x = i * (W / n) + gap / 2;
          const o = overlay ? Math.min(v, overlay(i)) : 0;
          const oh = (o / max) * (H - 4);
          return (
            <g key={rows[i].date}>
              <rect x={x} y={H - h} width={bw} height={h} fill={PALETTE.categorical[0]} rx={1}>
                <title>{`${rows[i].date}: ${format(v)}${overlay ? `, ${num(overlay(i))} failed` : ""}`}</title>
              </rect>
              {oh > 0 && <rect x={x} y={H - oh} width={bw} height={oh} fill={PALETTE.status.critical} />}
            </g>
          );
        })}
        <text x={0} y={H + 13} fontSize={10} fill={PALETTE.muted}>
          {rows[0]?.date}
        </text>
        <text x={W} y={H + 13} fontSize={10} fill={PALETTE.muted} textAnchor="end">
          {rows[n - 1]?.date}
        </text>
        <text x={W} y={10} fontSize={10} fill={PALETTE.muted} textAnchor="end">
          peak {format(max)}
        </text>
      </svg>
    </figure>
  );
}

/** Horizontal share bars for a small breakdown (surface, funding). */
export function Breakdown({
  rows,
  labelWidth = "7rem",
}: {
  rows: { label: string; value: number; display: string; note?: string }[];
  labelWidth?: string;
}) {
  if (rows.length === 0) return <Empty>Nothing in this window.</Empty>;
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: `${labelWidth} 1fr auto` }}>
          <span className="truncate text-pine/70" title={r.label}>
            {r.label}
          </span>
          <span className="h-3.5 overflow-hidden rounded-sm bg-pine/8">
            <span className="block h-full rounded-sm" style={{ width: `${(r.value / max) * 100}%`, background: PALETTE.sequential[1] }} />
          </span>
          <span className="whitespace-nowrap text-right font-mono tabular-nums text-pine/70">
            {r.display}
            {r.note && <span className="ml-2 text-pine/45">{r.note}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
