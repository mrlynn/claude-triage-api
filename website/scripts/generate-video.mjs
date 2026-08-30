/**
 * Render each lab as a narrated video, from the narration MP3s that already
 * exist and a card per section.
 *
 * WHY THIS COSTS NOTHING TO RUN: it does not call ElevenLabs. `npm run audio`
 * already voiced every lab, and this script times picture against those files
 * rather than commissioning new ones. Re-running it is free and offline, so it
 * is safe to iterate on card design without watching a credit balance.
 *
 * HOW THE TIMING WORKS, AND WHY IT IS ALLOWED TO BE APPROXIMATE: one voice
 * reading one register paces almost linearly with character count. Measured
 * across all 11 labs the rate is 14.3 characters per second with a 10% spread
 * between labs — so each lab's own rate (its character count over its measured
 * MP3 duration) predicts within-lab position far more tightly than that. A
 * section's share of the characters becomes its share of the runtime, which
 * makes the durations sum to the audio length exactly rather than drifting to
 * a black frame at the end. A card landing half a second early is invisible;
 * word-level alignment would mean re-voicing all 11 labs through the
 * timestamps endpoint to fix something nobody can see.
 *
 * WHAT IT REFUSES TO DO: build a video for a lab whose prose has changed since
 * its MP3 was generated. The timing would be derived from text the voice never
 * read, so every card after the first edit would sit at the wrong moment. Run
 * `npm run audio` and try again. This is not hypothetical — labs 1, 5 and 7
 * were all stale when this script was written.
 *
 *   npm run video -- --dry-run      # what would render, and how long
 *   npm run video -- --only lab-3   # one lab
 *   npm run video                   # everything with fresh audio
 *
 * Output goes to website/video-out/ and is gitignored. These are YouTube uploads,
 * not site assets — the site serves the MP3s, which are a hundredth the size.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { narration, sections } from "./lib/narration.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");
const repoRoot = resolve(websiteDir, "..");
const labsDir = join(repoRoot, "curriculum", "labs");
const audioDir = join(websiteDir, "static", "audio");
const manifestPath = join(audioDir, "manifest.json");
// NOT build/ — that is Docusaurus's output directory. It gets cleaned by
// `npm run build` and deployed by Vercel, so an hour of video written there
// would either vanish or ship to the site.
const outDir = join(websiteDir, "video-out");
const tmpDir = join(outDir, ".cards");

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
/* Below this a card reads as a flicker rather than a beat, so a short section
   is folded into the one before it instead of getting its own. */
const MIN_CARD_SECONDS = 6;

const BRAND = { pine: "#1f3d33", spruce: "#5c9a86", bone: "#f2ede4", ember: "#d9642a" };

function ffprobeDuration(file) {
  return Number(
    execFileSync("ffprobe", [
      "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", file,
    ]).toString().trim(),
  );
}

function labTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].replace(/`/g, "").trim() : null;
}

/**
 * The character-proportional split, with short sections folded left.
 *
 * Durations are derived from a running cumulative position rather than by
 * rounding each section independently, so they sum to the audio length exactly
 * and the last card cannot end early.
 */
function schedule(secs, duration) {
  const total = secs.reduce((n, s) => n + s.text.length, 0);
  const out = [];
  let charsSoFar = 0;
  let prevEnd = 0;
  for (const s of secs) {
    charsSoFar += s.text.length;
    const end = (charsSoFar / total) * duration;
    out.push({ ...s, start: prevEnd, duration: end - prevEnd });
    prevEnd = end;
  }

  const merged = [];
  for (const card of out) {
    const last = merged[merged.length - 1];
    if (last && card.duration < MIN_CARD_SECONDS) {
      last.duration += card.duration;
    } else {
      merged.push({ ...card });
    }
  }
  return merged;
}

/** One card. Deliberately sparse: the narration is carrying the content. */
function cardHtml({ eyebrow, title, index, count, progress }) {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  // narration() appends a full stop to every heading so the voice pauses on
  // it. That is right for the ear and wrong on a card. Question and
  // exclamation marks are the author's and stay.
  const display = (s) => String(s ?? "").replace(/\.$/, "");
  return `<!doctype html><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:${WIDTH}px;height:${HEIGHT}px;background:${BRAND.pine};color:${BRAND.bone};
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
      display:flex;flex-direction:column;justify-content:center;padding:150px 170px;position:relative;
      background-image:radial-gradient(ellipse at 78% 12%, rgba(92,154,134,.30), transparent 62%);}
    .eyebrow{font-size:34px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;
      color:${BRAND.spruce};margin-bottom:46px}
    h1{font-size:104px;line-height:1.08;letter-spacing:-.02em;font-weight:700;max-width:23ch}
    .rule{width:132px;height:8px;background:${BRAND.ember};border-radius:4px;margin-top:60px}
    footer{position:absolute;left:170px;right:170px;bottom:104px;display:flex;
      justify-content:space-between;align-items:center;font-size:28px;color:rgba(242,237,228,.62)}
    .track{position:absolute;left:0;right:0;bottom:0;height:12px;background:rgba(242,237,228,.14)}
    .fill{height:100%;width:${(progress * 100).toFixed(2)}%;background:${BRAND.spruce}}
  </style>
  <div class="eyebrow">${esc(display(eyebrow))}</div>
  <h1>${esc(display(title))}</h1>
  <div class="rule"></div>
  <footer><span>triage.mlynn.dev</span><span>${index} / ${count}</span></footer>
  <div class="track"><div class="fill"></div></div>`;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyAt = args.indexOf("--only");
const only = onlyAt === -1 ? null : args[onlyAt + 1];

if (!existsSync(manifestPath)) {
  console.error("No audio manifest. Run `npm run audio` first.");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const work = [];
const stale = [];
for (const file of readdirSync(labsDir).filter((f) => f.endsWith(".md")).sort()) {
  const slug = file.replace(/\.md$/, "");
  const id = `labs/${slug}`;
  if (only && !id.includes(only)) continue;

  const mp3 = join(audioDir, `${id}.mp3`);
  const record = manifest[id];
  if (!record || !existsSync(mp3)) {
    stale.push([id, "no audio generated yet"]);
    continue;
  }

  const md = readFileSync(join(labsDir, file), "utf8");
  const text = narration(md);
  const hash = createHash("sha256")
    .update(`${record.modelId}|${record.voiceId}|${text}`)
    .digest("hex");
  if (hash !== record.hash) {
    stale.push([id, `prose changed since voicing (${record.chars} chars voiced, ${text.length} now)`]);
    continue;
  }

  const duration = ffprobeDuration(mp3);
  const cards = schedule(sections(md), duration);
  work.push({ id, slug, mp3, duration, cards, title: labTitle(md) ?? slug });
}

for (const [id, why] of stale) console.warn(`skip    ${id} — ${why}`);
if (stale.length) console.warn(`        run \`npm run audio\` to refresh, then re-run\n`);

if (work.length === 0) {
  console.log("Nothing to render.");
  process.exit(stale.length ? 1 : 0);
}

const totalSeconds = work.reduce((n, w) => n + w.duration, 0);
console.log(
  `${work.length} lab(s), ${work.reduce((n, w) => n + w.cards.length, 0)} cards, ` +
    `${Math.round(totalSeconds / 60)} min of video. No API calls, no credits.`,
);
for (const w of work) {
  console.log(`  ${w.slug.padEnd(26)} ${String(w.cards.length).padStart(3)} cards  ${(w.duration / 60).toFixed(1)} min`);
}
if (dryRun) process.exit(0);

mkdirSync(tmpDir, { recursive: true });

// playwright is a devDependency but its browser is not — the npm package has
// no postinstall, which is what keeps `npm ci` in CI from pulling 130 MB for a
// script CI never runs. The cost is that the first run here needs one command.
let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  if (/Executable doesn't exist|please run|browserType.launch/.test(String(err))) {
    console.error("\nChromium is not installed. Once, from website/:\n\n  npx playwright install chromium\n");
    process.exit(1);
  }
  throw err;
}
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

for (const lab of work) {
  process.stdout.write(`rendering ${lab.slug} … `);
  const pngs = [];
  for (let i = 0; i < lab.cards.length; i++) {
    const card = lab.cards[i];
    await page.setContent(
      cardHtml({
        eyebrow: lab.title,
        title: card.title ?? lab.title,
        index: i + 1,
        count: lab.cards.length,
        progress: (card.start + card.duration) / lab.duration,
      }),
    );
    const png = join(tmpDir, `${lab.slug}-${String(i).padStart(3, "0")}.png`);
    await page.screenshot({ path: png });
    pngs.push(png);
  }

  // The concat demuxer ignores the final entry's duration, so the last card is
  // listed twice — the documented way to make it hold for its full length.
  const list = [
    ...lab.cards.map((c, i) => `file '${pngs[i]}'\nduration ${c.duration.toFixed(3)}`),
    `file '${pngs[pngs.length - 1]}'`,
  ].join("\n");
  const listPath = join(tmpDir, `${lab.slug}.txt`);
  writeFileSync(listPath, `${list}\n`);

  const out = join(outDir, `${lab.slug}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", listPath,
    "-i", lab.mp3,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k",
    // Not -shortest: the concat demuxer reports its duration lazily and the
    // repeated final card overshoots it, which left 11 seconds of silence on
    // the first render. The audio length is already known exactly, so cut there.
    "-t", lab.duration.toFixed(3),
    out,
  ]);
  const mb = readFileSync(out).length / 1024 / 1024;
  console.log(`${(lab.duration / 60).toFixed(1)} min, ${mb.toFixed(1)} MB`);
}

await browser.close();
rmSync(tmpDir, { recursive: true, force: true });
console.log(`\nWrote ${work.length} file(s) to ${outDir}`);
