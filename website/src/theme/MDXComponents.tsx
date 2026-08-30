import MDXComponents from "@theme-original/MDXComponents";
import Quiz from "@site/src/components/Quiz";
import TryThis from "@site/src/components/TryThis";
import Receipt from "@site/src/components/Receipt";
import ConceptPath from "@site/src/components/ConceptPath";

/**
 * Global MDX components. Remark plugins emit these into docs without imports.
 */
export default {
  ...MDXComponents,
  Quiz,
  TryThis,
  Receipt,
  ConceptPath,
};
