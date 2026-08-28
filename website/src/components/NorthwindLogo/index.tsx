import type { ReactNode } from "react";
import styles from "./styles.module.css";

/**
 * The Northwind Outfitters lockup.
 *
 * The mark is inlined rather than loaded through <img> for two reasons: the
 * mono variant needs currentColor, which does not resolve across an <img>
 * boundary, and the wordmark has to use the site's own type so the lockup
 * stays consistent without shipping a font file.
 *
 * Canonical SVG files live in assets/brand/ at the repo root.
 */

export type LogoVariant = "color" | "inverted" | "mono";

export function NorthwindMark({
  size = 40,
  variant = "color",
}: {
  size?: number;
  variant?: LogoVariant;
}): ReactNode {
  if (variant === "mono") {
    return (
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        role="img"
        aria-label="Northwind Outfitters"
      >
        <g fill="currentColor">
          <path d="M42 26 L58 47 H30 Z" opacity="0.55" />
          <path d="M26 16 L44 47 H8 Z" />
        </g>
      </svg>
    );
  }

  const badge = variant === "inverted" ? "#F2EDE4" : "#1F3D33";
  const front = variant === "inverted" ? "#1F3D33" : "#F2EDE4";

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Northwind Outfitters"
    >
      <rect width="64" height="64" rx="15" fill={badge} />
      <path d="M42 26 L58 47 H30 Z" fill="#5C9A86" />
      <path d="M26 16 L44 47 H8 Z" fill={front} />
      <path d="M26 16 L32 26 L28.5 25 L26 28 L23 24.5 L20 26 Z" fill={badge} />
    </svg>
  );
}

/**
 * The assistant's face. The mark's badge and summits are reproduced exactly —
 * same 64 box, same 15 radius, same three paths — with a tail swept off the
 * bottom edge. Ask Northwind is Northwind speaking, so it gets the mark
 * wearing a speech bubble rather than a mascot of its own.
 *
 * The "theme" variant paints from CSS variables instead of literals, which is
 * the whole reason this is inlined: one element that follows the colour mode,
 * rather than two <img> tags toggled by a media query.
 */
export function NorthwindAssistantMark({
  size = 24,
  variant = "color",
}: {
  size?: number;
  variant?: "color" | "inverted" | "theme";
}): ReactNode {
  const badge =
    variant === "theme"
      ? "var(--nw-assistant-badge)"
      : variant === "inverted"
        ? "#F2EDE4"
        : "#1F3D33";
  const front =
    variant === "theme"
      ? "var(--nw-assistant-front)"
      : variant === "inverted"
        ? "#1F3D33"
        : "#F2EDE4";

  return (
    <svg
      viewBox="0 0 64 74"
      width={size}
      // 74/64 — the tail hangs below the badge, so a square box would crop it.
      height={(size * 74) / 64}
      role="img"
      aria-label="Ask Northwind"
    >
      <path
        d="M15 0 H49 A15 15 0 0 1 64 15 V49 A15 15 0 0 1 49 64 H30 L13 74 L19 64 H15 A15 15 0 0 1 0 49 V15 A15 15 0 0 1 15 0 Z"
        fill={badge}
      />
      <path d="M42 26 L58 47 H30 Z" fill="#5C9A86" />
      <path d="M26 16 L44 47 H8 Z" fill={front} />
      <path d="M26 16 L32 26 L28.5 25 L26 28 L23 24.5 L20 26 Z" fill={badge} />
    </svg>
  );
}

export default function NorthwindLogo({
  size = 44,
  variant = "color",
  showTagline = false,
}: {
  size?: number;
  variant?: LogoVariant;
  showTagline?: boolean;
}): ReactNode {
  return (
    <div className={styles.lockup}>
      <NorthwindMark size={size} variant={variant} />
      <div className={styles.type}>
        <div
          className={styles.wordmark}
          style={{ fontSize: `${size * 0.5}px` }}
        >
          NORTHWIND
        </div>
        <div
          className={styles.subword}
          style={{ fontSize: `${size * 0.23}px` }}
        >
          OUTFITTERS
        </div>
        {showTagline && (
          <div className={styles.tagline}>Guaranteed for the life of the gear.</div>
        )}
      </div>
    </div>
  );
}
