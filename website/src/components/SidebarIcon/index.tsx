import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  Compass,
  FlaskConical,
  GitCompare,
  GraduationCap,
  KeyRound,
  Library,
  Map,
  Network,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Named Lucide icons for sidebar items. Keep the set small — the sidebar is a
 * reading order, not an app nav, and a long icon catalogue would fight that.
 */
export const SIDEBAR_ICONS = {
  compass: Compass,
  book: BookOpen,
  map: Map,
  wrench: Wrench,
  network: Network,
  library: Library,
  flask: FlaskConical,
  compare: GitCompare,
  arrow: ArrowRight,
  boxes: Boxes,
  terminal: Terminal,
  graduation: GraduationCap,
  key: KeyRound,
} as const satisfies Record<string, LucideIcon>;

export type SidebarIconName = keyof typeof SIDEBAR_ICONS;

export function isSidebarIconName(value: unknown): value is SidebarIconName {
  return typeof value === "string" && value in SIDEBAR_ICONS;
}

/** Reads `customProps.icon` from a sidebar item, if it is a known name. */
export function iconFromCustomProps(
  customProps: unknown,
): SidebarIconName | undefined {
  if (!customProps || typeof customProps !== "object") {
    return undefined;
  }
  const icon = (customProps as { icon?: unknown }).icon;
  return isSidebarIconName(icon) ? icon : undefined;
}

type Props = {
  name: SidebarIconName;
  className?: string;
};

export default function SidebarIcon({ name, className }: Props): ReactNode {
  const Icon = SIDEBAR_ICONS[name];
  return (
    <Icon
      className={className}
      aria-hidden="true"
      focusable="false"
      size={15}
      strokeWidth={1.75}
    />
  );
}
