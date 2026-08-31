/**
 * Generate narration MP3s for the lab pages via the ElevenLabs API.
 *
 * WHY PRE-GENERATED FILES instead of a hosted "listen" widget: the labs are
 * static content that is read far more often than it is edited. Generating
 * once per content change and committing the MP3 to static/audio/ means the
 * site serves audio like any other asset — no third-party script, no
 * per-listen or per-month cost, and deploys never touch the API. The only
 * spend is regeneration, and the hash check below keeps that to pages whose
 * narration text actually changed.
 *
 * Run it manually when lab prose changes (it is deliberately NOT part of the
 * build — a deploy must not be able to spend credits):
 *
 *   npm run audio -- --dry-run     # what would generate, and the credit cost
 *   npm run audio -- --only lab-3  # one lab
 *   npm run audio                  # everything stale
 *
 * Reads ELEVENLABS_API_KEY / ELEVEN_LABS_API_KEY from the environment or the
 * repo-root .env.local / .env. Voice and model are overridable the same way.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
// Shared with generate-video.mjs, which times picture against this exact
// text. See lib/narration.mjs for why there is only one copy.
import { narration } from "./lib/narration.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");
const repoRoot = resolve(websiteDir, "..");
const labsDir = join(repoRoot, "curriculum", "labs");
const audioDir = join(websiteDir, "static", "audio", "labs");
const manifestPath = join(websiteDir, "static", "audio", "manifest.json");

// "George" — a calm narration voice. Changing voice or model regenerates
// every lab on the next run (both are part of the hash), which is the point:
// a course should not switch narrators halfway through.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5";
// 64 kbps is transparent for a single voice and keeps the whole course's
// audio small enough to commit without thinking about it.
const OUTPUT_FORMAT = "mp3_44100_64";

// Flash and Turbo bill 0.5 credits per character; everything else 1.
const CREDITS_PER_CHAR = /flash|turbo/.test(MODEL_ID) ? 0.5 : 1;

function apiKey() {
  for (const name of ["ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"]) {
    if (process.env[name]) return process.env[name];
  }
  for (const file of [".env.local", ".env"]) {
    const path = join(repoRoot, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(
        /^(?:ELEVENLABS_API_KEY|ELEVEN_LABS_API_KEY)\s*=\s*"?([^"#\s]+)/,
      );
      if (m) return m[1];
    }
  }
  return null;
}

/** Split on paragraph boundaries so no request exceeds the API's text cap. */
function chunk(text, max = 9500) {
  const chunks = [];
  let current = "";
  for (const para of text.split("\n\n")) {
    if (current && current.length + para.length + 2 > max) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function synthesize(text, key) {
  const chunks = chunk(text);
  const parts = [];
  for (let i = 0; i < chunks.length; i++) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          text: chunks[i],
          model_id: MODEL_ID,
          // Prosody context across chunk boundaries, so a lab split into two
          // requests does not audibly restart in the middle.
          previous_text: i > 0 ? chunks[i - 1].slice(-500) : undefined,
          next_text: i < chunks.length - 1 ? chunks[i + 1].slice(0, 500) : undefined,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      // Running out of credits mid-run is an ordinary outcome, not a crash. A
      // stack trace here buries the one number that matters and makes a
      // resumable stop look like a broken script. There is no pre-flight for
      // it: a TTS-scoped key gets 401 from /v1/user/subscription, so the first
      // reliable word on the balance is this response.
      let quota = null;
      try {
        const parsed = JSON.parse(body);
        if (parsed?.detail?.status === "quota_exceeded") quota = parsed.detail.message;
      } catch {
        /* Not JSON. Fall through to the generic error below. */
      }
      if (quota) {
        const err = new Error(quota);
        err.quotaExceeded = true;
        throw err;
      }
      throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 300)}`);
    }
    parts.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(parts);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyAt = args.indexOf("--only");
const only = onlyAt === -1 ? null : args[onlyAt + 1];

const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : {};

const pages = readdirSync(labsDir)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => ({ file: join(labsDir, f), id: `labs/${f.replace(/\.md$/, "")}` }))
  .filter((p) => !only || p.id.includes(only));

const work = [];
for (const page of pages) {
  const text = narration(readFileSync(page.file, "utf8"));
  const hash = createHash("sha256")
    .update(`${MODEL_ID}|${VOICE_ID}|${text}`)
    .digest("hex");
  const mp3 = join(websiteDir, "static", "audio", `${page.id}.mp3`);
  if (manifest[page.id]?.hash === hash && existsSync(mp3)) {
    console.log(`fresh   ${page.id}`);
    continue;
  }
  work.push({ ...page, text, hash, mp3 });
}

const chars = work.reduce((n, w) => n + w.text.length, 0);
console.log(
  `${work.length} page(s) to generate, ${chars.toLocaleString()} chars ≈ ` +
    `${Math.ceil(chars * CREDITS_PER_CHAR).toLocaleString()} credits ` +
    `(${MODEL_ID}, voice ${VOICE_ID})`,
);
if (dryRun || work.length === 0) process.exit(0);

const key = apiKey();
if (!key) {
  console.error(
    "No ELEVENLABS_API_KEY / ELEVEN_LABS_API_KEY in the environment or repo-root .env.local",
  );
  process.exit(1);
}

mkdirSync(audioDir, { recursive: true });
let done = 0;
for (const w of work) {
  process.stdout.write(`voicing ${w.id} (${w.text.length.toLocaleString()} chars)… `);
  let audio;
  try {
    audio = await synthesize(w.text, key);
  } catch (err) {
    if (!err.quotaExceeded) throw err;
    const left = work.slice(done);
    const chars = left.reduce((n, x) => n + x.text.length, 0);
    console.log("out of credits\n");
    console.error(`ElevenLabs: ${err.message}\n`);
    console.error(
      `${done} page(s) voiced and recorded. ${left.length} still to do, ` +
        `${chars.toLocaleString()} chars ≈ ${Math.ceil(chars * CREDITS_PER_CHAR).toLocaleString()} credits:`,
    );
    for (const x of left) console.error(`  ${x.id}`);
    console.error(
      "\nNothing was lost — the manifest is written after every page, so " +
        "re-running picks up exactly here once the quota resets or the plan changes.",
    );
    process.exit(1);
  }
  writeFileSync(w.mp3, audio);
  // The exact text the voice read, next to the audio it read it from. Without
  // this, nothing in the repo records what was actually said, and answering
  // "is the current prose a truncation of what was voiced, or a rewrite?"
  // needs archaeology through git for the narration rule in force at the time.
  // trim-audio.mjs depends on being able to answer that exactly.
  writeFileSync(w.mp3.replace(/\.mp3$/, ".txt"), `${w.text}\n`);
  manifest[w.id] = {
    hash: w.hash,
    voiceId: VOICE_ID,
    modelId: MODEL_ID,
    chars: w.text.length,
    generatedAt: new Date().toISOString(),
  };
  // Rewritten after every page so a failure mid-run loses nothing.
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${(audio.length / 1024 / 1024).toFixed(1)} MB`);
  done++;
}
