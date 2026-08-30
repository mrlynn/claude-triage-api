/**
 * Upload the rendered lab videos to YouTube, with their captions, thumbnail
 * and description.
 *
 * WHAT THIS IS FOR: the .mp4 is the easy half of a YouTube upload — the hard
 * half is a description with working chapter timestamps, a caption track that
 * spells "EventSource" correctly, and a thumbnail that is not a random frame.
 * `npm run video` writes all of those next to each video; this pushes the set.
 *
 * BEFORE IT WILL WORK, once:
 *   1. Create a Google Cloud project and enable the YouTube Data API v3.
 *   2. Create an OAuth 2.0 Client ID of type "Web application" — NOT "Desktop
 *      app". The OAuth Playground in step 4 is the quickest way to a refresh
 *      token and it only works with a web client, because it needs its own
 *      redirect URI registered and a desktop client cannot carry one.
 *   3. Add https://developers.google.com/oauthplayground to that client's
 *      Authorized redirect URIs. Without it step 4 fails redirect_uri_mismatch.
 *   4. At https://developers.google.com/oauthplayground, open the gear, tick
 *      "Use your own OAuth credentials", paste the id and secret, authorise
 *      the scope https://www.googleapis.com/auth/youtube.upload, then exchange
 *      the code for a refresh token.
 *   5. PUBLISH THE CONSENT SCREEN. While its publishing status is "Testing", an
 *      external-user-type project issues refresh tokens that expire in seven
 *      days, and youtube.upload is not one of the scopes exempt from that. Left
 *      in Testing, this script works for a week and then fails on token
 *      refresh — which looks like a broken script rather than an expired grant.
 *   6. Put these in the repo-root .env.local:
 *        YOUTUBE_CLIENT_ID=...
 *        YOUTUBE_CLIENT_SECRET=...
 *        YOUTUBE_REFRESH_TOKEN=...
 *
 * TWO THINGS TO EXPECT. Uploads from a project created after 28 July 2020 are
 * "restricted to private viewing mode" until the project passes a Terms of
 * Service audit, so the first run leaves private videos whatever --privacy
 * says. And videos.insert costs 1 unit against a dedicated bucket of 100
 * uploads a day, so eleven labs is nowhere near a limit.
 *
 *   npm run upload -- --dry-run          # what would go, and under what title
 *   npm run upload -- --only lab-3       # one lab
 *   npm run upload -- --privacy unlisted # default is private
 *
 * Uploaded ids are recorded in video-out/uploaded.json, so re-running skips
 * what is already up rather than posting it twice.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fromEnv } from "./lib/env.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");
const repoRoot = resolve(websiteDir, "..");
const outDir = join(websiteDir, "video-out");
const ledgerPath = join(outDir, "uploaded.json");
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyAt = args.indexOf("--only");
const only = onlyAt === -1 ? null : args[onlyAt + 1];
const privacyAt = args.indexOf("--privacy");
const privacy = privacyAt === -1 ? "private" : args[privacyAt + 1];

if (!["private", "unlisted", "public"].includes(privacy)) {
  console.error(`--privacy must be private, unlisted or public (got "${privacy}")`);
  process.exit(1);
}

async function accessToken() {
  const id = fromEnv(["YOUTUBE_CLIENT_ID"], repoRoot);
  const secret = fromEnv(["YOUTUBE_CLIENT_SECRET"], repoRoot);
  const refresh = fromEnv(["YOUTUBE_REFRESH_TOKEN"], repoRoot);
  const missing = [
    !id && "YOUTUBE_CLIENT_ID",
    !secret && "YOUTUBE_CLIENT_SECRET",
    !refresh && "YOUTUBE_REFRESH_TOKEN",
  ].filter(Boolean);
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")} in the environment or repo-root .env.local.`);
    console.error("See the header of this file for how to get them.");
    process.exit(1);
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const expired = /invalid_grant/.test(body);
    throw new Error(
      `Token refresh failed (${res.status}): ${body}` +
        (expired
          ? "\n\ninvalid_grant usually means the refresh token has expired. A " +
            "project whose\nOAuth consent screen is still in \"Testing\" issues " +
            "refresh tokens that last seven\ndays. Publish the consent screen, " +
            "then issue a new token."
          : ""),
    );
  }
  return (await res.json()).access_token;
}

/** Fail with the API's own message rather than a bare status code. */
async function ok(res, what) {
  if (res.ok) return res;
  const body = await res.text();
  let detail = body.slice(0, 400);
  try {
    detail = JSON.parse(body)?.error?.message ?? detail;
  } catch {
    /* Not JSON; the raw text is the best message available. */
  }
  throw new Error(`${what} failed (${res.status}): ${detail}`);
}

/**
 * Resumable upload: ask for a session, then send the bytes to the URL it hands
 * back. Resumable rather than simple because a lab video is tens of megabytes
 * and a single POST that dies at 90% leaves nothing to resume from.
 */
async function uploadVideo(token, meta, file) {
  const bytes = readFileSync(file);
  const session = await ok(
    await fetch(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-upload-content-length": String(bytes.length),
        "x-upload-content-type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: {
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          categoryId: meta.categoryId,
          defaultLanguage: meta.defaultLanguage,
        },
        status: {
          privacyStatus: privacy,
          // Required on every upload since 2020. The labs are not for kids,
          // and omitting the field makes the API reject the request outright.
          selfDeclaredMadeForKids: false,
        },
      }),
    }),
    "Creating the upload session",
  );
  const location = session.headers.get("location");
  if (!location) throw new Error("Upload session returned no Location header");

  const done = await ok(
    await fetch(location, {
      method: "PUT",
      headers: { "content-type": "video/mp4", "content-length": String(bytes.length) },
      body: bytes,
    }),
    "Uploading the video",
  );
  return (await done.json()).id;
}

async function setThumbnail(token, videoId, file) {
  await ok(
    await fetch(`${UPLOAD}/thumbnails/set?videoId=${videoId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "image/jpeg" },
      body: readFileSync(file),
    }),
    "Setting the thumbnail",
  );
}

/**
 * captions.insert takes multipart/related — a JSON part describing the track
 * and a second part holding the file. Assembled by hand rather than pulling in
 * the googleapis SDK for one request.
 */
async function addCaptions(token, videoId, file) {
  const boundary = `----caption${Date.now()}`;
  const meta = JSON.stringify({
    snippet: { videoId, language: "en", name: "English", isDraft: false },
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`),
    readFileSync(file),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  await ok(
    await fetch(`${UPLOAD}/captions?part=snippet&uploadType=multipart`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }),
    "Uploading captions",
  );
}

if (!existsSync(outDir)) {
  console.error(`No ${outDir}. Run \`npm run video\` first.`);
  process.exit(1);
}

const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : {};

const jobs = readdirSync(outDir)
  .filter((f) => f.endsWith(".json") && f !== "uploaded.json")
  .sort()
  .map((f) => JSON.parse(readFileSync(join(outDir, f), "utf8")))
  .filter((m) => !only || m.slug.includes(only));

const pending = [];
for (const meta of jobs) {
  if (ledger[meta.slug]) {
    console.log(`up      ${meta.slug} → https://youtu.be/${ledger[meta.slug].videoId}`);
    continue;
  }
  const video = join(outDir, meta.video);
  if (!existsSync(video)) {
    console.warn(`skip    ${meta.slug} — ${meta.video} is missing; re-run \`npm run video\``);
    continue;
  }
  pending.push({ meta, video });
}

if (pending.length === 0) {
  console.log("Nothing to upload.");
  process.exit(0);
}

console.log(`\n${pending.length} to upload as ${privacy}:`);
for (const { meta, video } of pending) {
  const mb = readFileSync(video).length / 1024 / 1024;
  console.log(`  ${meta.slug.padEnd(26)} ${mb.toFixed(1).padStart(5)} MB  ${meta.chapters.length} chapters`);
  console.log(`    ${meta.title}`);
}
if (dryRun) process.exit(0);

const token = await accessToken();

for (const { meta, video } of pending) {
  process.stdout.write(`uploading ${meta.slug}… `);
  const videoId = await uploadVideo(token, meta, video);
  process.stdout.write("video ");

  const thumb = join(outDir, meta.thumbnail);
  if (existsSync(thumb)) {
    await setThumbnail(token, videoId, thumb);
    process.stdout.write("thumbnail ");
  }
  const srt = join(outDir, meta.captions);
  if (existsSync(srt)) {
    await addCaptions(token, videoId, srt);
    process.stdout.write("captions ");
  }

  ledger[meta.slug] = { videoId, uploadedAt: new Date().toISOString(), privacy };
  // Written after every video so an interrupted run never re-posts one.
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`→ https://youtu.be/${videoId}`);
}

console.log(`\nIds recorded in ${ledgerPath}`);
if (privacy !== "private") {
  console.log(
    "If these came out private anyway, the project has not passed its Terms of\n" +
      "Service audit yet — that restriction applies to uploads from any project\n" +
      "created after 28 July 2020.",
  );
}
