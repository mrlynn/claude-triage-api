/**
 * Lab markdown to spoken text, and the section boundaries inside it.
 *
 * WHY THIS IS SHARED: generate-audio.mjs turns this text into an MP3, and
 * generate-video.mjs times the picture against that MP3 by counting characters
 * (see its header for why that works). Those two only agree while they are
 * reading the same string. A second copy of `narration()` that drifted by one
 * character would desynchronise every card in the course, silently, with
 * nothing failing. So there is one copy and both import it.
 *
 * Changing anything here changes the audio hash and re-voices all 11 labs on
 * the next `npm run audio`. That costs credits. Check `--dry-run` first.
 */

/**
 * Turn lab markdown into text worth listening to. Code fences, tables, and
 * images are dropped rather than read aloud — a voice spelling out a curl
 * command helps nobody, and the fences alone are a third of the character
 * count. Headings keep their text and gain a period so the voice pauses.
 */
export function narration(md) {
  return lines(md)
    .map((l) => l.text)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The same pass, but keeping which lines were headings and at what level.
 * `narration()` is this joined; nothing else may reimplement the cleaning.
 */
export function lines(md) {
  const out = [];
  let inFence = false;
  for (const raw of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*\|/.test(raw)) continue; // table rows
    if (/^\s*!\[/.test(raw)) continue; // image lines
    if (/^\s*<[^>]*>\s*$/.test(raw)) continue; // bare HTML lines

    const heading = raw.match(/^(#{1,6})\s/);
    let text = raw
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/·/g, ",")
      .replace(/→/g, " to ")
      .replace(/[ \t]+/g, " ")
      .trimEnd();
    if (heading && text && !/[.?!:]$/.test(text)) text += ".";
    out.push({ text, level: heading ? heading[1].length : 0 });
  }
  return out;
}

/**
 * Split the narration into the chunks a card will be held over.
 *
 * Splits at h2 — h3 is usually a step inside one idea, and a card per step
 * flickers. The returned `text` values concatenate back to exactly what
 * `narration()` returns, which is what makes character-proportional timing
 * land on the audio instead of near it. `assertSectionsMatchNarration` in
 * generate-video.mjs enforces that rather than trusting this comment.
 */
export function sections(md, { splitAtLevel = 2 } = {}) {
  const full = narration(md);
  const headings = lines(md)
    .filter((l) => l.level > 0 && l.level <= splitAtLevel && l.text)
    .map((l) => l.text);

  const found = [];
  let cursor = 0;
  for (const h of headings) {
    // Match the heading as a whole line, from where the last one ended, so a
    // heading whose words also appear in prose cannot steal the boundary.
    const at = full.indexOf(`\n${h}\n`, cursor);
    if (at === -1) continue;
    found.push({ title: h, start: at + 1 });
    cursor = at + h.length;
  }

  if (found.length === 0) return [{ title: null, text: full }];

  const out = [];
  // Anything before the first heading is the lab's own opening.
  if (found[0].start > 0) {
    out.push({ title: null, text: full.slice(0, found[0].start) });
  }
  for (let i = 0; i < found.length; i++) {
    const end = i + 1 < found.length ? found[i + 1].start : full.length;
    out.push({ title: found[i].title, text: full.slice(found[i].start, end) });
  }
  return out;
}
