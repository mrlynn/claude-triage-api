/**
 * The parts of a YouTube upload that are not the video file.
 *
 * WHY THIS IS THE HALF WORTH AUTOMATING: pushing an .mp4 through videos.insert
 * replaces a drag and drop. Writing chapter timestamps, a caption track and a
 * description for eleven labs replaces an afternoon — and the timing needed for
 * the first two is already computed to build the picture, so it costs nothing
 * to emit here.
 */

/** hh:mm:ss, or m:ss under an hour — the form YouTube parses in a description. */
export function stamp(seconds, { srt = false } = {}) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (srt) {
    const ms = Math.round((s - Math.floor(s)) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:` +
      `${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  }
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/**
 * Turn cards into chapters, under YouTube's three rules: the first must be at
 * 00:00, each must run at least ten seconds, and there must be at least three
 * or none are shown at all.
 *
 * The card timeline does not satisfy that on its own — cards can be four
 * seconds — so a short chapter is absorbed into the one before it rather than
 * being emitted and silently invalidating the whole list. Code cards never
 * open a chapter: "curl -N -s localhost" is not a place a viewer navigates to,
 * and the heading it sits under already is.
 */
export function chapters(cards, labTitle) {
  const MIN = 10;
  const out = [];
  let at = 0;
  for (const card of cards) {
    const start = at;
    at += card.duration;
    if (card.kind === "code") continue;
    const title = String(card.title ?? labTitle).replace(/\.$/, "");
    const last = out[out.length - 1];
    if (last && start - last.start < MIN) continue;
    out.push({ start, title });
  }
  if (out.length === 0) return [];
  // The first has to be 00:00 whatever the cards said.
  out[0] = { start: 0, title: out[0].title };
  // Three is the floor for YouTube to render any of them.
  return out.length >= 3 ? out : [];
}

/**
 * Split the narration into caption cues, timed by the same character-
 * proportional model the cards use.
 *
 * WHY BOTHER WHEN YOUTUBE TRANSCRIBES FOR FREE: speech recognition is good at
 * English and bad at exactly what this course says out loud — EventSource,
 * ReadableStream, requires_human, src/config.ts. The words are already written
 * down, so guessing at them from audio is the worse of two available options.
 */
export function cues(text, duration, { maxChars = 84 } = {}) {
  const total = text.length || 1;
  const at = (offset) => (Math.min(total, Math.max(0, offset)) / total) * duration;

  const out = [];
  for (const seg of sentences(text)) {
    // Wrap the sentence, then hand each line a share of the sentence's span in
    // proportion to its length. Deriving the offsets by re-finding each line in
    // the source drifted — the first cut of this produced a cue that started
    // before the previous one ended — and a proportional split inside a span
    // that is already correct cannot go backwards.
    const lines = wrap(seg.text, maxChars);
    const chars = lines.reduce((n, l) => n + l.length, 0) || 1;
    let consumed = 0;
    for (const line of lines) {
      const from = seg.at + (consumed / chars) * seg.text.length;
      consumed += line.length;
      const to = seg.at + (consumed / chars) * seg.text.length;
      out.push({ from: at(from), to: at(to), text: line });
    }
  }

  // A cue shorter than the eye can read is worse than a longer one, so hold
  // each until the next begins, capped so they never overlap.
  for (let i = 0; i < out.length; i++) {
    const next = i + 1 < out.length ? out[i + 1].from : duration;
    out[i].to = Math.min(next, Math.max(out[i].to + 0.35, out[i].from + 1.1));
    if (out[i].to <= out[i].from) out[i].to = out[i].from + 0.2;
  }
  return out;
}

/**
 * Sentences, with the offset each one starts at.
 *
 * Scanned rather than split, because String.split discards the separator and
 * the offsets have to be reconstructed from lengths that no longer add up.
 * Full stops, question and exclamation marks end a sentence; a colon does not
 * — splitting on it turned "Time: 35 minutes" into a cue reading "Time:".
 */
function sentences(text) {
  const out = [];
  let start = 0;
  const push = (from, to) => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) out.push({ at: from + lead, text: trimmed });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const ends = c === "\n" || (/[.?!]/.test(c) && (i + 1 === text.length || /\s/.test(text[i + 1])));
    if (!ends) continue;
    push(start, i + 1);
    start = i + 1;
  }
  push(start, text.length);
  return out;
}

/** Greedy wrap, never breaking a word that is itself longer than the cap. */
function wrap(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

export function toSrt(list) {
  return list
    .map((c, i) => `${i + 1}\n${stamp(c.from, { srt: true })} --> ${stamp(c.to, { srt: true })}\n${c.text}\n`)
    .join("\n");
}

/**
 * The description, with the chapter list first.
 *
 * Chapters have to be the first thing after the summary or a viewer has to
 * expand the description to find them, which defeats the point of having them.
 */
export function description({ summary, chapterList, labUrl, courseUrl, shopUrl, repoUrl, solutionsNote }) {
  const parts = [summary.trim(), ""];
  if (chapterList.length) {
    parts.push("Chapters", ...chapterList.map((c) => `${stamp(c.start)} ${c.title}`), "");
  }
  parts.push(
    `Work through this lab yourself: ${labUrl}`,
    `The whole course: ${courseUrl}`,
    `The shop the tickets come from: ${shopUrl}`,
    `The code: ${repoUrl}`,
    "",
  );
  if (solutionsNote) parts.push(solutionsNote, "");
  parts.push(
    "Northwind Outfitters is invented. The shapes are not.",
    "",
    "Personal educational project. Views are my own and are not affiliated with or endorsed by Cursor.",
  );
  return parts.join("\n");
}
