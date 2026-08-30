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
import { createRequire } from "node:module";
import { narration, walk } from "./lib/narration.mjs";
import { chapters, cues, toSrt, description, stamp } from "./lib/youtube-meta.mjs";

// Prism ships CommonJS language definitions, and registering a language is a
// side effect on the shared object rather than an export.
const require_ = createRequire(import.meta.url);
const Prism = require_("prismjs");
for (const lang of ["bash", "typescript", "javascript", "json"]) {
  require_(`prismjs/components/prism-${lang}.js`);
}

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
/* Below this a card reads as a flicker rather than a beat, so a short one is
   folded into the card before it instead of getting its own. */
const MIN_CARD_SECONDS = 4;

/* Fence languages that are prose or a custom Docusaurus block rather than code
   a viewer would want to read. `mermaid` is a diagram and belongs on a card
   eventually, but rendering one needs more than a syntax highlighter. */
const NOT_CODE = new Set(["quiz", "try", "receipt", "mermaid"]);

/* Prism's name for the languages the labs actually use. */
const PRISM_LANG = { ts: "typescript", js: "javascript", sh: "bash", shell: "bash", "": null };

/* The code box, in pixels. Sized to the body's content width so the card and
   the heading cards share a left edge. */
const CODE_BOX = { w: 1640, h: 720 };

const BRAND = { pine: "#1f3d33", spruce: "#5c9a86", bone: "#f2ede4", ember: "#d9642a" };

const COURSE_URL = "https://triage.mlynn.dev";
const SHOP_URL = "https://northwind.mlynn.dev";
const REPO_URL = "https://github.com/mrlynn/claude-triage-api";
/* YouTube's own recommendation, and what its player expects. */
const THUMB = { w: 1280, h: 720 };

function ffprobeDuration(file) {
  return Number(
    execFileSync("ffprobe", [
      "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", file,
    ]).toString().trim(),
  );
}

/**
 * The lab's opening prose, as the description's first lines.
 *
 * Taken from the lab rather than written fresh, because a description that
 * disagrees with the lab it describes is worse than a short one. It starts
 * after the first section heading — above that is the title and a "Time /
 * Prerequisites" line, which tell a reader nothing about what the lab is —
 * and accumulates whole paragraphs rather than taking the first one over a
 * length threshold. Lab 2 opens on "Northwind already had a classifier that
 * hit 84% accuracy. They cancelled it.", which is 72 characters and is the
 * best sentence in the lab; a threshold skipped it for the paragraph after.
 */
function labSummary(md, fallback) {
  const afterFirstHeading = md.split(/^##\s+.+$/m).slice(1).join("\n\n");
  const out = [];
  let length = 0;
  for (const para of (afterFirstHeading || md).split(/\n\s*\n/)) {
    if (/^\s*(#|\||>|!\[|```)/.test(para)) continue;
    if (/\*\*(Time|Prerequisites|Answers):\*\*/.test(para)) continue;
    const text = narration(para).replace(/\s*\n+\s*/g, " ").trim();
    if (!text) continue;
    out.push(text);
    length += text.length;
    if (length >= 200 || out.length >= 2) break;
  }
  const joined = out.join("\n\n").trim();
  if (!joined) return fallback;
  return joined.length > 700 ? `${joined.slice(0, 697)}…` : joined;
}

function labTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].replace(/`/g, "").trim() : null;
}

/**
 * Turn one lab's landmarks into the cards that will be held over its audio.
 *
 * Headings and code fences both become cards, at the character offset where
 * the narration reaches them. A fence contributes no characters — the voice
 * never reads it — so its card appears exactly as the narrator crosses from
 * the prose that introduced the code to the prose that explains it, which is
 * the moment a viewer wants to be looking at it.
 *
 * Durations come from a running cumulative position rather than by rounding
 * each card independently, so they sum to the audio length exactly and the
 * last card cannot end early.
 */
function schedule(events, totalChars, duration, labTitle) {
  const cards = [];
  let heading = labTitle;
  for (const e of events) {
    if (e.kind === "heading") {
      heading = e.text;
      cards.push({ kind: "heading", title: e.text, eyebrow: labTitle, at: e.at });
      continue;
    }
    const lang = e.lang ?? "";
    if (NOT_CODE.has(lang)) continue;
    if (!e.code.trim()) continue;
    cards.push({ kind: "code", code: e.code, lang, eyebrow: heading, at: e.at });
  }

  // The lab opens on its own title until the first landmark.
  if (cards.length === 0 || cards[0].at > 0) {
    cards.unshift({ kind: "heading", title: labTitle, eyebrow: labTitle, at: 0 });
  }

  let prevEnd = 0;
  const timed = cards.map((card, i) => {
    const nextAt = i + 1 < cards.length ? cards[i + 1].at : totalChars;
    const end = (nextAt / totalChars) * duration;
    const out = { ...card, start: prevEnd, duration: end - prevEnd };
    prevEnd = end;
    return out;
  });

  const merged = [];
  for (const card of timed) {
    const last = merged[merged.length - 1];
    if (last && card.duration < MIN_CARD_SECONDS) {
      last.duration += card.duration;
    } else {
      merged.push({ ...card });
    }
  }
  return merged;
}

/**
 * Trim a block that cannot be held legibly in one frame.
 *
 * The font size itself is settled in the browser by `fitToFrame` — guessing it
 * from a monospace advance-width constant got a curl line clipped off the
 * right edge, because the estimate missed the pre's own padding. Measuring
 * beats estimating when a measuring device is already open. What has to happen
 * here is the cut: a 60-line file shrunk until it fits is not a visual aid, it
 * is a texture, so past a line budget it is truncated instead.
 */
function fitCode(code) {
  const MAX_LINES = 26;
  const lines = code.replace(/\s+$/, "").split("\n");
  if (lines.length <= MAX_LINES) return lines;
  return [...lines.slice(0, MAX_LINES), "…"];
}

/**
 * Grow the code to fill the frame, then shrink it until it actually fits.
 *
 * One round trip: the loop runs in the page, where scrollWidth against
 * clientWidth is ground truth for both axes rather than an approximation of
 * them. Growing first matters as much as shrinking — a six-line snippet set at
 * a size chosen for a thirty-line one is unreadable on a phone.
 */
async function fitToFrame(page) {
  return page.evaluate(
    ({ min, max }) => {
      const pre = document.querySelector("pre");
      if (!pre) return null;
      const fits = () =>
        pre.scrollWidth <= pre.clientWidth && pre.scrollHeight <= pre.clientHeight;
      let size = parseFloat(getComputedStyle(pre).fontSize);
      while (size < max && fits()) {
        size += 1;
        pre.style.fontSize = `${size}px`;
      }
      while (size > min && !fits()) {
        size -= 1;
        pre.style.fontSize = `${size}px`;
      }
      return size;
    },
    { min: 12, max: 46 },
  );
}

function highlight(lines, lang) {
  const name = lang in PRISM_LANG ? PRISM_LANG[lang] : lang;
  const grammar = name ? Prism.languages[name] : null;
  const text = lines.join("\n");
  if (!grammar) {
    return text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  }
  return Prism.highlight(text, grammar, name);
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
// narration() appends a full stop to every heading so the voice pauses on it.
// That is right for the ear and wrong on a card. Question and exclamation
// marks are the author's and stay.
const display = (s) => String(s ?? "").replace(/\.$/, "");

/* Shared chrome, so a code card and a heading card are visibly the same deck. */
function shell(inner, { footerRight, progress }) {
  return `<!doctype html><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:100vw;height:100vh;background:${BRAND.pine};color:${BRAND.bone};
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
      display:flex;flex-direction:column;justify-content:center;padding:120px 140px;position:relative;
      background-image:radial-gradient(ellipse at 78% 12%, rgba(92,154,134,.30), transparent 62%);}
    .eyebrow{font-size:30px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;
      color:${BRAND.spruce};margin-bottom:38px}
    h1{font-size:104px;line-height:1.08;letter-spacing:-.02em;font-weight:700;max-width:23ch}
    .rule{width:132px;height:8px;background:${BRAND.ember};border-radius:4px;margin-top:60px}
    pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      background:rgba(0,0,0,.26);border:1px solid rgba(242,237,228,.13);border-radius:14px;
      padding:38px 44px;overflow:hidden;white-space:pre;tab-size:2;line-height:1.55;
      /* max-height, not height: the box hugs short snippets instead of leaving
         a cavern around three lines, and still caps at a frame's worth so
         scrollHeight vs clientHeight detects vertical overflow. */
      max-height:${CODE_BOX.h}px;width:${CODE_BOX.w}px}
    .lang{position:absolute;top:-15px;left:44px;background:${BRAND.ember};color:#1b1b1b;
      font:700 22px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.12em;
      text-transform:uppercase;padding:9px 16px;border-radius:6px}
    .wrap{position:relative}
    footer{position:absolute;left:140px;right:140px;bottom:74px;display:flex;
      justify-content:space-between;align-items:center;font-size:26px;color:rgba(242,237,228,.62)}
    .track{position:absolute;left:0;right:0;bottom:0;height:12px;background:rgba(242,237,228,.14)}
    .fill{height:100%;width:${(progress * 100).toFixed(2)}%;background:${BRAND.spruce}}
    .token.comment{color:rgba(242,237,228,.44);font-style:italic}
    .token.string,.token.attr-value{color:#a9d6c3}
    .token.keyword,.token.operator,.token.parameter{color:#e79a68}
    .token.function,.token.class-name{color:${BRAND.bone};font-weight:600}
    .token.number,.token.boolean{color:#d9a05a}
    .token.builtin,.token.property,.token.constant{color:#8fc9b3}
    .token.punctuation{color:rgba(242,237,228,.55)}
    .token.variable{color:#cfe6dc}
  </style>${inner}
  <footer><span>triage.mlynn.dev</span><span>${esc(footerRight)}</span></footer>
  <div class="track"><div class="fill"></div></div>`;
}

function headingCard({ eyebrow, title, footerRight, progress }) {
  return shell(
    `<div class="eyebrow">${esc(display(eyebrow))}</div>
     <h1>${esc(display(title))}</h1>
     <div class="rule"></div>`,
    { footerRight, progress },
  );
}

function codeCard({ eyebrow, code, lang, footerRight, progress }) {
  const lines = fitCode(code);
  return shell(
    `<div class="eyebrow">${esc(display(eyebrow))}</div>
     <div class="wrap">
       ${lang ? `<span class="lang">${esc(lang)}</span>` : ""}
       <pre style="font-size:22px"><code>${highlight(lines, lang)}</code></pre>
     </div>`,
    { footerRight, progress },
  );
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
  const title = labTitle(md) ?? slug;
  const cards = schedule(walk(md).events, text.length, duration, title);
  work.push({ id, slug, mp3, duration, cards, title, text, summary: labSummary(md, title) });
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
  const code = w.cards.filter((c) => c.kind === "code").length;
  console.log(
    `  ${w.slug.padEnd(26)} ${String(w.cards.length).padStart(3)} cards ` +
      `(${String(code).padStart(2)} code)  ${(w.duration / 60).toFixed(1)} min`,
  );
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
    const common = {
      footerRight: `${i + 1} / ${lab.cards.length}`,
      progress: (card.start + card.duration) / lab.duration,
    };
    await page.setContent(
      card.kind === "code"
        ? codeCard({ eyebrow: card.eyebrow, code: card.code, lang: card.lang, ...common })
        : headingCard({ eyebrow: card.eyebrow, title: card.title, ...common }),
    );
    if (card.kind === "code") await fitToFrame(page);
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
  // --- everything the upload needs that is not the video file ---
  const chapterList = chapters(lab.cards, lab.title);
  const srt = toSrt(cues(lab.text, lab.duration));
  const title = `${lab.title} — Claude API course`;
  const meta = {
    slug: lab.slug,
    title: title.length > 100 ? `${title.slice(0, 99)}…` : title,
    description: description({
      labTitle: lab.title,
      summary: lab.summary,
      chapterList,
      labUrl: `${COURSE_URL}/docs/labs/${lab.slug}`,
      courseUrl: COURSE_URL,
      shopUrl: SHOP_URL,
      repoUrl: REPO_URL,
      solutionsNote: "Solutions for every lab are in the course repository.",
    }),
    tags: ["Claude API", "Anthropic", "LLM", "structured outputs", "tool use", "streaming", "prompt caching", "evals"],
    categoryId: "28", // Science & Technology
    defaultLanguage: "en",
    video: `${lab.slug}.mp4`,
    captions: `${lab.slug}.srt`,
    thumbnail: `${lab.slug}.thumb.jpg`,
    chapters: chapterList.map((c) => ({ at: stamp(c.start), title: c.title })),
  };
  writeFileSync(join(outDir, `${lab.slug}.srt`), srt);
  // A plain-text title and description alongside the JSON, because uploading
  // by hand is a perfectly good option and copying prose out of a JSON string
  // with escaped newlines in it is not.
  writeFileSync(join(outDir, `${lab.slug}.txt`), `${meta.title}\n\n${meta.description}`);
  writeFileSync(join(outDir, `${lab.slug}.json`), `${JSON.stringify(meta, null, 2)}\n`);

  // The thumbnail is the title card at YouTube's size, not a frame grab: a
  // grab lands on whatever card happened to be up and is usually a code block.
  await page.setViewportSize({ width: THUMB.w, height: THUMB.h });
  await page.setContent(
    headingCard({ eyebrow: "Claude API course", title: lab.title, footerRight: "", progress: 0 }),
  );
  await page.screenshot({ path: join(outDir, `${lab.slug}.thumb.jpg`), type: "jpeg", quality: 88 });
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });

  const mb = readFileSync(out).length / 1024 / 1024;
  console.log(
    `${(lab.duration / 60).toFixed(1)} min, ${mb.toFixed(1)} MB, ` +
      `${chapterList.length} chapters, ${srt.split("\n\n").length - 1} cues`,
  );
}

await browser.close();
rmSync(tmpDir, { recursive: true, force: true });
console.log(
  `\nWrote ${work.length} video(s) to ${outDir}, each with .srt captions, ` +
    "a .thumb.jpg and a .json the uploader reads.",
);
