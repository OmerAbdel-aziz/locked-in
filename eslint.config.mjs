import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Convex regenerates this on every `npx convex dev`; linting it only
    // produces warnings we can never fix (its eslint-disable headers are
    // correct for Convex's own config, not ours).
    "convex/_generated/**",
  ]),
]);

export default eslintConfig;
