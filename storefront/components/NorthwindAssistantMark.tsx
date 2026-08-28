/**
 * Ask Northwind's avatar.
 *
 * The same drawing as the course site's — canonical source is
 * assets/brand/northwind-assistant.svg at the repo root. It is duplicated
 * rather than imported because the storefront and the course site are
 * separately deployed apps that share no build; assets/brand/ is the shared
 * source of truth and each app keeps its own copy, the way the mark SVGs
 * already do.
 *
 * The mark's badge and summits are reproduced exactly — same 64 box, same 15
 * radius — with a tail swept off the bottom edge. Ask Northwind is Northwind
 * speaking, so it wears a speech bubble rather than getting a mascot of its
 * own.
 *
 * Inlined rather than loaded through <img> so the fills can be set per
 * placement. The storefront is light-only, so there is no theme variant here:
 * "inverted" is for the Pine launcher and header, plain for Bone grounds.
 */
export default function NorthwindAssistantMark({
  size = 22,
  variant = "color",
  className,
}: {
  size?: number;
  variant?: "color" | "inverted";
  className?: string;
}) {
  const badge = variant === "inverted" ? "#F2EDE4" : "#1F3D33";
  const front = variant === "inverted" ? "#1F3D33" : "#F2EDE4";

  return (
    <svg
      viewBox="0 0 64 74"
      width={size}
      // 74/64 — the tail hangs below the badge, so a square box would crop it.
      height={(size * 74) / 64}
      className={className}
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
