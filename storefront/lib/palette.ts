/**
 * Chart palette.
 *
 * Lives in its own module, not in the chart components, because those are
 * "use client" — and a non-component export from a client module becomes a
 * client *reference* when a Server Component imports it, so `PALETTE.categorical`
 * is undefined at prerender time. Plain data shared across the boundary has to
 * live outside the client module.
 *
 * Every value below was checked with the dataviz validator rather than picked
 * by eye. Categorical stops at three: a fourth hue failed all-pairs CVD
 * separation, and the correct fix for that is fewer series, not more colours.
 */
export const PALETTE = {
  /** Fixed order. Never cycled, never extended past three. */
  categorical: ["#00896B", "#3A6FD8", "#D9642A"],
  /** One hue, light to dark. For magnitude. */
  sequential: ["#6EB9A1", "#45A084", "#238567", "#036A4F", "#004C38"],
  /** Reserved. Never reused as a series colour. */
  status: { good: "#036A4F", warning: "#B5761A", critical: "#B3261E" },
  deemphasis: "#B9C2BC",
  surface: "#F7F3EC",
  grid: "#DFD8CB",
  ink: "#1F3D33",
  muted: "#6B7C74",
} as const;
