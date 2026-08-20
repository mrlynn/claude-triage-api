# Northwind Outfitters brand assets

Northwind Outfitters is the fictional company the labs are built around. See
[the scenario](../../curriculum/scenario.md) for who they are and why any of
this exists.

| File | Use |
|---|---|
| `northwind-mark.svg` | Primary. Dark badge, on light grounds. Also the source for site favicons. |
| `northwind-mark-inverted.svg` | Light badge, on dark grounds. |
| `northwind-mark-mono.svg` | One colour, no badge. Inherits `currentColor` when inlined. |

Favicons for the course site (`website/static/img/favicon.*`) and the
storefront (`storefront/app/favicon.ico`, `icon.svg`, `apple-icon.png`) are
generated from `northwind-mark.svg` so the tab icon matches the mark on
[/brand](https://claude-triage-labs.vercel.app/brand).

The mark is two overlapping summits with a snowline notch, set in a rounded
badge. It was picked over three alternatives because it is the only one that
still reads at 18px, which is the size that actually matters — a favicon, a
sidebar icon, a row in a support queue.

`currentColor` only resolves when the SVG is inlined in the page. Referenced
through an `<img>` tag it falls back to black, so use the React component in
`website/src/components/NorthwindLogo` where the colour needs to follow the
theme.

## Palette

| Token | Hex | Use |
|---|---|---|
| Pine | `#1F3D33` | badge, primary text |
| Spruce | `#5C9A86` | rear summit, secondary |
| Bone | `#F2EDE4` | front summit, light ground |
| Ember | `#D9642A` | accent only, never in the mark |
| Slate | `#8A9A93` | muted text, rules |
