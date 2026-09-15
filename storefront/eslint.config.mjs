import { createRequire, registerHooks } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";

/**
 * typescript-eslint needs the TypeScript compiler API, which TS 7 does not ship
 * (typescript-eslint#10940). `typescript` stays on 7 so `tsc` and `next build`
 * type-check with it; inside this ESLint process only, `typescript` resolves to
 * the TS 6 API installed as `typescript6`.
 *
 * This is the side-by-side setup from the TS 7 announcement, inverted: the post
 * aliases `typescript` to TS 6, but Next's build check runs the `tsc` of whatever
 * `typescript` resolves to, so that would move `next build` to TS 6. The alias
 * is `typescript6` rather than @typescript/typescript6 because npm links bins
 * first-path-wins, and that wrapper's @typescript/old dependency sorts ahead of
 * `typescript` and takes over node_modules/.bin/tsc.
 *
 * Remove this hook (and `typescript6`) once typescript-eslint supports TS 7.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "typescript" || specifier.startsWith("typescript/")) {
      specifier = "typescript6" + specifier.slice("typescript".length);
    }
    return nextResolve(specifier, context);
  },
});

// Imported after the hook is registered; a static import would be hoisted above it.
const { default: nextVitals } = await import("eslint-config-next/core-web-vitals");
const { default: nextTs } = await import("eslint-config-next/typescript");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next sets `version: "detect"`, and eslint-plugin-react 7.37
    // detects through context.getFilename(), which ESLint 10 removed. Reading
    // the installed version here skips detection without pinning a number.
    settings: { react: { version: createRequire(import.meta.url)("react/package.json").version } },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
