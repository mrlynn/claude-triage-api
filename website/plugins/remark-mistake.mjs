import { visit, SKIP } from "unist-util-visit";

/**
 * Removes ```mistake fenced blocks from the rendered site, after checking them.
 *
 * A mistake block is Tutor data, not prose: one wrong line a learner writes,
 * its fix, what they see, and why. The Tutor plants these in starter code
 * (scripts/sync-storefront.ts carries them into its corpus). The lab already
 * teaches each one in its own words, so rendering the JSON would say it twice.
 *
 * Same CommonMark-on-GitHub rationale as remark-quiz: on GitHub the block shows
 * as a readable code fence. The rules here mirror `mistakeProblem` in
 * storefront/lib/tutorPolicy.ts, which the sync enforces too; a broken block
 * fails whichever build reaches it first.
 *
 *     ```mistake
 *     { "id": "...", "wrong": "...", "right": "...", "symptom": "...", "why": "..." }
 *     ```
 */
export default function remarkMistake() {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "mistake" || !parent) return;

      let data;
      try {
        data = JSON.parse(node.value);
      } catch (err) {
        throw new Error(`Invalid JSON in a \`\`\`mistake block: ${err.message}\n${node.value}`);
      }

      for (const m of Array.isArray(data) ? data : [data]) {
        for (const key of ["id", "wrong", "right", "symptom", "why"]) {
          if (typeof m?.[key] !== "string" || !m[key].trim()) {
            throw new Error(`A mistake item needs a non-empty "${key}". Got: ${JSON.stringify(m)}`);
          }
        }
        if (m.wrong.includes("\n")) throw new Error(`Mistake "${m.id}": "wrong" must be one line`);
        if (m.right.includes(m.wrong.trim())) {
          throw new Error(`Mistake "${m.id}": "right" still contains the "wrong" line`);
        }
      }

      parent.children.splice(index, 1);
      return [SKIP, index];
    });
  };
}
