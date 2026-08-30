/**
 * Lab markdown to spoken text, and the landmarks inside it.
 *
 * WHY THIS IS SHARED: generate-audio.mjs turns this text into an MP3, and
 * generate-video.mjs times the picture against that MP3 by counting characters
 * (see its header for why that works). Those two only agree while they are
 * reading the same string. A second copy of `narration()` that drifted by one
 * character would desynchronise every card in the course, silently, with
 * nothing failing. So there is one copy and both import it.
 *
 * Changing anything that affects `narration()` changes the audio hash and
 * re-voices all 11 labs on the next `npm run audio`. That costs credits. Check
 * `--dry-run` first. Adding to `walk()`'s events is free — the video reads
 * those and the voice never sees them.
 */

/**
 * One pass over the markdown, producing both the spoken text and the position
 * of every landmark inside it.
 *
 * WHY ONE PASS: a card is placed at a character offset into the narration, and
 * that offset has to be exact. Computing the text and the offsets separately
 * means two traversals that can disagree — which is the same trap the shared
 * module exists to avoid, one level down.
 *
 * The blank-line collapse happens inline rather than as a `\n{3,}` pass at the
 * end, because a post-hoc collapse shifts every offset already recorded. It is
 * equivalent: skipping an empty line whose predecessor was also empty produces
 * exactly what collapsing runs of three-or-more newlines produces.
 */
export function walk(md) {
  const emitted = [];
  const events = [];
  let inFence = false;
  let fenceLang = "";
  let fenceLines = [];

  for (const raw of md.split("\n")) {
    const fence = raw.match(/^\s*(?:```|~~~)(.*)$/);
    if (fence) {
      if (inFence) {
        events.push({
          kind: "code",
          lang: fenceLang.trim().toLowerCase(),
          code: fenceLines.join("\n"),
          line: emitted.length,
        });
        inFence = false;
        fenceLines = [];
      } else {
        inFence = true;
        fenceLang = fence[1];
      }
      continue;
    }
    if (inFence) {
      fenceLines.push(raw);
      continue;
    }
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

    // The inline equivalent of collapsing /\n{3,}/ to "\n\n" afterwards.
    if (text === "" && emitted.length > 0 && emitted[emitted.length - 1] === "") {
      continue;
    }
    if (heading && text) {
      events.push({ kind: "heading", level: heading[1].length, text, line: emitted.length });
    }
    emitted.push(text);
  }

  const joined = emitted.join("\n");
  const text = joined.trim();
  // trim() removes leading blank lines, which shifts every recorded offset.
  const lead = joined.length - joined.trimStart().length;

  // Offset of emitted line i is the length of everything before it plus the
  // newlines between. Accumulated once rather than re-summed per event.
  const lineOffset = [];
  let at = 0;
  for (const line of emitted) {
    lineOffset.push(at);
    at += line.length + 1;
  }
  lineOffset.push(at);

  for (const e of events) {
    e.at = Math.max(0, Math.min(text.length, (lineOffset[e.line] ?? joined.length) - lead));
    delete e.line;
  }

  return { text, events };
}

/**
 * Turn lab markdown into text worth listening to. Code fences, tables, and
 * images are dropped rather than read aloud — a voice spelling out a curl
 * command helps nobody, and the fences alone are a third of the character
 * count. Headings keep their text and gain a period so the voice pauses.
 */
export function narration(md) {
  return walk(md).text;
}
