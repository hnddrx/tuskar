import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output anywhere, not just at the root. A worktree under .claude
    // carries its own .next, and linting minified bundles buries the real
    // findings under hundreds of errors from generated code.
    "**/.next/**",
    ".claude/**",
    ".agents/**",
  ]),
]);

export default eslintConfig;
