import MDXComponents from "@theme-original/MDXComponents";
import Quiz from "@site/src/components/Quiz";

/**
 * Global MDX components. Quiz is registered here so that the remark plugin
 * can emit <Quiz /> into any doc without that doc importing anything.
 */
export default {
  ...MDXComponents,
  Quiz,
};
