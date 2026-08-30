import { visit } from "unist-util-visit";

/**
 * Turns a ```try fenced block into a <TryThis /> component.
 *
 * Same rationale as remark-quiz: lab markdown stays CommonMark for GitHub
 * (and for tags like <customer_message>), while the site gets a real React
 * embed of a playground tool.
 *
 *     ```try
 *     {
 *       "tool": "queue",
 *       "title": "See what the fields are for",
 *       "lead": "Start on As received and find the safety report.",
 *       "href": "/playground/queue"
 *     }
 *     ```
 */
const TOOLS = new Set([
  "queue",
  "trace",
  "cache",
  "injection",
  "cost",
  "models",
  "batch",
  "stream",
]);

export default function remarkTry() {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "try" || !parent) return;

      let data;
      try {
        data = JSON.parse(node.value);
      } catch (err) {
        throw new Error(
          `Invalid JSON in a \`\`\`try block: ${err.message}\n${node.value}`,
        );
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error(
          `A \`\`\`try block needs a single JSON object. Got: ${JSON.stringify(data)}`,
        );
      }
      if (!TOOLS.has(data.tool)) {
        throw new Error(
          `Unknown try tool "${data.tool}". Expected one of: ${[...TOOLS].join(", ")}`,
        );
      }
      if (typeof data.title !== "string" || !data.title.trim()) {
        throw new Error(`A \`\`\`try block needs a non-empty "title" string.`);
      }

      const props = {
        tool: data.tool,
        title: data.title,
        ...(typeof data.lead === "string" ? { lead: data.lead } : {}),
        ...(typeof data.href === "string" ? { href: data.href } : {}),
      };

      parent.children[index] = {
        type: "mdxJsxFlowElement",
        name: "TryThis",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "config",
            value: {
              type: "mdxJsxAttributeValueExpression",
              value: JSON.stringify(props),
              data: {
                estree: {
                  type: "Program",
                  sourceType: "module",
                  comments: [],
                  body: [
                    {
                      type: "ExpressionStatement",
                      expression: jsonToEstree(props),
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
