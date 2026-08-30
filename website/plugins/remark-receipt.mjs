import { visit } from "unist-util-visit";

/**
 * Turns a ```receipt fenced block into a <Receipt /> component.
 * Same CommonMark-on-GitHub rationale as remark-quiz / remark-try.
 */
export default function remarkReceipt() {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "receipt" || !parent) return;

      let data;
      try {
        data = JSON.parse(node.value);
      } catch (err) {
        throw new Error(
          `Invalid JSON in a \`\`\`receipt block: ${err.message}\n${node.value}`,
        );
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("A ```receipt block needs a single JSON object.");
      }
      for (const key of ["input", "output", "cost"]) {
        if (data[key] === undefined) {
          throw new Error(`A \`\`\`receipt block needs "${key}".`);
        }
      }

      parent.children[index] = jsxElement("Receipt", { config: data });
    });
  };
}

function jsxElement(name, props) {
  return {
    type: "mdxJsxFlowElement",
    name,
    attributes: Object.entries(props).map(([key, value]) => ({
      type: "mdxJsxAttribute",
      name: key,
      value: {
        type: "mdxJsxAttributeValueExpression",
        value: JSON.stringify(value),
        data: {
          estree: {
            type: "Program",
            sourceType: "module",
            comments: [],
            body: [
              {
                type: "ExpressionStatement",
                expression: jsonToEstree(value),
              },
            ],
          },
        },
      },
    })),
    children: [],
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
