/**
 * Screenshots of the live surfaces, for use in things that are not the app.
 *
 * Two scripts need this — the talk's slide stills and the README's gallery —
 * and before this module they each carried their own copy of the Chrome
 * lookup and the crop-and-encode step. Two copies of "where is Chrome on this
 * machine" is one copy too many: the second one is always the one that has
 * not been fixed.
 *
 * WHY HEADLESS CHROME AND NOT A LIBRARY: Playwright and Puppeteer each pull a
 * browser download into a repo whose whole point is that a learner can clone
 * it and run one command. Chrome's own `--screenshot` flag is already on
 * every machine this is run from.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/** Retina, so a still holds up when a projector or a HiDPI screen scales it. */
export const SCALE = 2;

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

export function chrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `No Chrome found. Set CHROME_BIN. Looked in:\n  ${CHROME_CANDIDATES.join("\n  ")}`,
    );
  }
  return found;
}

/**
 * Loads `url` at `viewport` and writes a full-viewport PNG into `dir`.
 *
 * `--virtual-time-budget` rather than a sleep: fonts, images and the client
 * render all have to settle before the shutter, and virtual time makes that
 * deterministic instead of a race that passes on a fast laptop.
 */
export function capture({ name, url, viewport, dir, dark = false }) {
  const [w, h] = viewport;
  const out = join(dir, `${name}.png`);
  execFileSync(
    chrome(),
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      `--force-device-scale-factor=${SCALE}`,
      `--window-size=${w},${h}`,
      "--virtual-time-budget=8000",
      // The docs site defaults to dark and respects the OS preference, so the
      // colour scheme of a still is decided here rather than by whoever runs
      // the script.
      ...(dark ? ["--force-dark-mode", "--enable-features=WebContentsForceDark"] : []),
      `--screenshot=${out}`,
      url,
    ],
    { stdio: "ignore" },
  );
  return out;
}

/**
 * Crops in CSS pixels — the units the page was designed in — and encodes.
 *
 * THE CROP IS THE POINT. A full-page screenshot shrunk into a slide or a
 * README column arrives as grey texture; cropping to the one element the
 * image is about magnifies it to legible at the same display width. It also
 * removes the "Ask Northwind" dock, which is fixed to the bottom-right of
 * every page and reads as a mistake in the corner of a picture.
 */
export async function crop({ from, to, rect, width, quality = 82 }) {
  const [x, y, w, h] = rect.map((n) => n * SCALE);
  const pipeline = sharp(from)
    .extract({ left: x, top: y, width: w, height: h })
    .resize({ width, withoutEnlargement: true });

  await (to.endsWith(".png")
    ? pipeline.png({ compressionLevel: 9 })
    : pipeline.jpeg({ quality, progressive: true, mozjpeg: true })
  ).toFile(to);

  return { w, h };
}
