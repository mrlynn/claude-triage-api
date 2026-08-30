import { visit } from "unist-util-visit";

/**
 * Turns a ```path fenced block into a <ConceptPath /> nav of lab links.
 */
export default function remarkPath() {
  return (tree) => {
    visit(tree, "code", (node, index, parent) => {
      if (node.lang !== "path" || !parent) return;

      let data;
      try {
        data = JSON.parse(node.value);
      } catch (err) {
        throw new Error(
          `Invalid JSON in a \`\`\`path block: ${err.message}\n${node.value}`,
        );
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("A ```path block needs a non-empty JSON array.");
      }
      for (const item of data) {
        if (!item?.label || !item?.to || !item?.detail) {
          throw new Error(
            `Each path item needs label, detail, and to. Got: ${JSON.stringify(item)}`,
          );
        }
      }

      parent.children[index] = {
        type: "mdxJsxFlowElement",
        name: "ConceptPath",
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "items",
            value: {
              type: "mdxJsxAttributeValueExpression",
              value: JSON.stringify(data),
              data: {
                estree: {
                  type: "Program",
                  sourceType: "module",
                  comments: [],
                  body: [
                    {
                      type: "ExpressionStatement",
                      expression: jsonToEstree(data),
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
