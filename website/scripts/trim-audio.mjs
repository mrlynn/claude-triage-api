/**
 * Re-align a lab's narration MP3 by cutting its tail, instead of paying to
 * voice the whole lab again.
 *
 * WHY THIS EXISTS: removing "Answers: ../solutions/lab-N.md" from the spoken
 * text changed 32 characters at the very end of five labs, and re-voicing them
 * for that costs about 12,400 credits. The voice already says everything the
 * new text says — it just says one more sentence afterwards. Cutting is exact
 * and free where re-voicing is neither.
 *
 * WHEN IT APPLIES, AND ONLY THEN: the current narration must be a strict
 * prefix of what was voiced. If anything changed in the middle, no amount of
 * trimming makes the audio right and the lab has to be re-voiced — this
 * refuses rather than producing something that is quietly wrong. lab-9 is the
 * live example: its "../next-steps.md" also became "next steps", six
 * characters in the middle, so it is not eligible.
 *
 * FINDING THE CUT. Proportional timing is not good enough here. The trailing
 * line is a path, and the voice reads a path at about 9 characters a second
 * against a 14 chars/sec average for prose — estimating the tail from
 * character count would leave a fragment of it audible. So the cut comes from
 * the audio: the last pause long enough to be a paragraph break that leaves a
 * plausible tail behind it.
 *
 * The check on that is consistency. Every lab's trailing line is the same
 * sentence bar a digit, so its spoken length should be the same in every lab —
 * and the tails this finds land within half a second of each other. A rule
 * picking the wrong gap would not produce that. `--dry-run` prints them so the
 * agreement can be seen rather than trusted.
 *
 *   npm run audio:trim -- --dry-run
 *   npm run audio:trim
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { narration } from "./lib/narration.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");
const repoRoot = resolve(websiteDir, "..");
const labsDir = join(repoRoot, "curriculum", "labs");
const audioDir = join(websiteDir, "static", "audio");
const manifestPath = join(audioDir, "manifest.json");

/* A paragraph break, not a comma. Below this the gaps found are the pause
   after the colon inside the trailing line itself. */
const GAP_DB = -45;
const GAP_SECONDS = 0.4;
/* The trailing line runs about 4.2 seconds. The window is wide enough to
   tolerate a different lab number and narrow enough that a mid-sentence gap
   cannot be mistaken for the break before it. */
const TAIL_MIN = 2.5;
const TAIL_MAX = 5.5;
/* Measured across all 11 labs: 14.3 chars/sec, 10.4% spread. A trim that lands
   outside this has cut the wrong thing. */
const RATE_MIN = 12.5;
const RATE_MAX = 16.0;

const dryRun = process.argv.includes("--dry-run");

function duration(file) {
  return Number(
    execFileSync("ffprobe", [
      "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", file,
    ]).toString().trim(),
  );
}

/**
 * Every silence of at least GAP_SECONDS, as {start, length}.
 *
 * silencedetect writes to stderr at info level, so muting ffmpeg with
 * `-v error` returns nothing and looks exactly like a file with no silence in
 * it. That cost an hour once.
 */
function silences(file) {
  // spawnSync, because the output needed is on stderr and execFileSync
  // returns stdout — which for this command is empty.
  const out = spawnSync(
    "ffmpeg",
    ["-i", file, "-af", `silencedetect=noise=${GAP_DB}dB:d=${GAP_SECONDS}`, "-f", "null", "-"],
    { encoding: "utf8" },
  ).stderr;
  const found = [];
  let start = null;
  for (const line of out.split("\n")) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    if (s) start = Number(s[1]);
    const d = line.match(/silence_duration:\s*([\d.]+)/);
    if (d && start !== null) {
      found.push({ start, length: Number(d[1]) });
      start = null;
    }
  }
  return found;
}

/** The earliest gap leaving a tail in the expected window — the paragraph
    break before the trailing line, rather than a pause inside it. */
function cutPoint(file, total) {
  return (
    silences(file)
      .filter((g) => total - g.start >= TAIL_MIN && total - g.start <= TAIL_MAX)
      .sort((a, b) => a.start - b.start)[0] ?? null
  );
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const work = [];
const skipped = [];

for (const [id, record] of Object.entries(manifest)) {
  const md = join(labsDir, `${id.split("/")[1]}.md`);
  const mp3 = join(audioDir, `${id}.mp3`);
  if (!existsSync(md) || !existsSync(mp3)) continue;

  const text = narration(readFileSync(md, "utf8"));
  const hash = createHash("sha256")
    .update(`${record.modelId}|${record.voiceId}|${text}`)
    .digest("hex");
  if (hash === record.hash) continue; // already correct

  // Only a pure truncation can be fixed by cutting. "Shorter" is not proof of
  // that — lab-9 lost its trailing line AND had six characters change in the
  // middle, so it is shorter and still not trimmable. The transcript written
  // beside the MP3 makes the test exact instead of inferred.
  const transcriptPath = mp3.replace(/\.mp3$/, ".txt");
  if (!existsSync(transcriptPath)) {
    skipped.push([
      id,
      "no transcript beside the MP3, so a truncation cannot be told from a " +
        "rewrite — re-voice, which writes one",
    ]);
    continue;
  }
  const voiced = readFileSync(transcriptPath, "utf8").replace(/\n$/, "");
  if (!voiced.startsWith(text)) {
    skipped.push([id, "the text changed mid-document, not just at the end — re-voice"]);
    continue;
  }
  if (voiced.length === text.length) {
    skipped.push([id, "nothing to cut"]);
    continue;
  }
  const total = duration(mp3);
  const gap = cutPoint(mp3, total);
  if (!gap) {
    skipped.push([id, "no paragraph break found in the expected window — re-voice"]);
    continue;
  }
  const rate = text.length / gap.start;
  if (rate < RATE_MIN || rate > RATE_MAX) {
    skipped.push([id, `cut implies ${rate.toFixed(1)} chars/sec, outside 12.5–16 — re-voice`]);
    continue;
  }
  work.push({ id, mp3, text, hash, total, cut: gap.start, tail: total - gap.start, rate });
}

for (const [id, why] of skipped) console.warn(`skip    ${id} — ${why}`);

if (work.length === 0) {
  console.log("Nothing to trim.");
  process.exit(0);
}

console.log(`\n${work.length} lab(s) to trim. No API calls, no credits.`);
for (const w of work) {
  console.log(
    `  ${w.id.split("/")[1].padEnd(24)} cut at ${w.cut.toFixed(2)}s, ` +
      `tail ${w.tail.toFixed(2)}s, ${w.rate.toFixed(1)} chars/sec`,
  );
}
const tails = work.map((w) => w.tail);
const mean = tails.reduce((a, b) => a + b, 0) / tails.length;
console.log(
  `  tails: mean ${mean.toFixed(2)}s, spread ${(Math.max(...tails) - Math.min(...tails)).toFixed(2)}s ` +
    "— the same sentence in every lab, so these agreeing is the check",
);
if (dryRun) process.exit(0);

for (const w of work) {
  process.stdout.write(`trimming ${w.id} … `);
  const tmp = `${w.mp3}.trim.mp3`;
  // Re-encoded rather than stream-copied: a copy cuts on a frame boundary,
  // which can leave a fragment of the next syllable at the chosen time.
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-i", w.mp3,
    "-t", w.cut.toFixed(3),
    "-c:a", "libmp3lame", "-b:a", "64k", "-ar", "44100",
    tmp,
  ]);
  renameSync(tmp, w.mp3);

  manifest[w.id] = {
    ...manifest[w.id],
    hash: w.hash,
    chars: w.text.length,
    trimmedAt: new Date().toISOString(),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${w.total.toFixed(1)}s → ${duration(w.mp3).toFixed(1)}s`);
}

console.log("\nRun `npm run video` to render these.");
