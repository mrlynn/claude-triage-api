/**
 * Northwind's palette and mark, for images rendered outside the app.
 *
 * The storefront paints from Tailwind config and the docs site from CSS
 * variables; neither is reachable from a Node script rasterising an SVG. This
 * is the third copy of the palette and it is a deliberate one — but it is now
 * the ONLY copy on the scripting side, shared by the social cards and the
 * README artwork rather than pasted into each.
 *
 * Canonical values live on /brand. If they change there, change them here.
 */

export const PINE = "#1f3d33";
export const SPRUCE = "#5c9a86";
export const BONE = "#f2ede4";
export const EMBER = "#d9642a";

/**
 * Text is drawn with an explicit font stack rather than a webfont: these are
 * rasterised here, once, on a machine that has these faces, so there is no
 * loading path at view time to get wrong.
 */
export const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";
export const MONO = "SF Mono, Menlo, monospace";

/** The header mark, scaled into a 64-unit box at an arbitrary origin. */
export function mark(x, y, size) {
  const s = size / 64;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect width="64" height="64" rx="15" fill="${SPRUCE}" opacity="0.18"/>
    <path d="M42 26 L58 47 H30 Z" fill="${SPRUCE}"/>
    <path d="M26 16 L44 47 H8 Z" fill="${BONE}"/>
    <path d="M26 16 L32 26 L28.5 25 L26 28 L23 24.5 L20 26 Z" fill="${PINE}"/>
  </g>`;
}
