import { visit } from "unist-util-visit";

/**
 * Turns a ```quiz fenced block into a <Quiz /> component.
 *
 * WHY A PLUGIN AND NOT MDX: the lab markdown is CommonMark on purpose. It is
 * read directly on GitHub and it contains things like <customer_message> tags
 * that MDX would try to parse as JSX. Switching the docs to MDX to get one
 * component would make every future edit a potential build break.
 *
 * So the source stays plain markdown — a fenced block, which renders as a
 * readable code block on GitHub — and this plugin swaps it for a real React
 * component at build time. Authors write JSON, not JSX.
 *
 *     ```quiz
 *     { "question": "...", "options": [...], "answer": 1, "explain": "..." }
 *     ```
 */
export default function remarkQuiz() {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "quiz" || !parent) return;

      let data;
      try {
        data = JSON.parse(node.value);
      } catch (err) {
        throw new Error(
          `Invalid JSON in a \`\`\`quiz block: ${err.message}\n${node.value}`,
        );
      }

      const items = Array.isArray(data) ? data : [data];
      for (const q of items) {
        if (!q.question || !Array.isArray(q.options) || typeof q.answer !== "number") {
          throw new Error(
            `A quiz item needs question, options[] and a numeric answer index. Got: ${JSON.stringify(q)}`,
          );
        }
        if (q.answer < 0 || q.answer >= q.options.length) {
          throw new Error(`Quiz answer index ${q.answer} is out of range for "${q.question}"`);
        }
      }

      parent.children[index] = {
        type: "mdxJsxFlowElement",
        name: "Quiz",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "items",
            value: {
              type: "mdxJsxAttributeValueExpression",
              value: JSON.stringify(items),
              data: {
                estree: {
                  type: "Program",
                  sourceType: "module",
                  comments: [],
                  body: [
                    {
                      type: "ExpressionStatement",
                      expression: jsonToEstree(items),
                    },
                  ],
                },
              },
            },
          },
        ],
        children: [],
      };
    });
  };
}

/** Minimal JSON -> ESTree literal, so the attribute is a real expression. */
function jsonToEstree(value) {
  if (Array.isArray(value)) {
    return { type: "ArrayExpression", elements: value.map(jsonToEstree) };
  }
  if (value && typeof value === "object") {
    return {
      type: "ObjectExpression",
      properties: Object.entries(value).map(([k, v]) => ({
        type: "Property",
        method: false,
        shorthand: false,
        computed: false,
        kind: "init",
        key: { type: "Literal", value: k },
        value: jsonToEstree(v),
      })),
    };
  }
  return { type: "Literal", value: value ?? null };
}
