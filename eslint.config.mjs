import js from "@eslint/js";
import next from "eslint-config-next";
import tseslint from "typescript-eslint";

/**
 * Flat ESLint config (ESLint v9+).
 *
 * Lint scope: the entire source tree. Build artefacts and generated
 * Next.js types are the only ignores — everything else (including
 * Trigger.dev tasks, CLI scripts, and tests) is linted, with
 * directory-specific rule relaxations applied via overrides below.
 *
 * Run: npm run lint
 */
const config = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".trigger/**",
      "dist/**",
      "next-env.d.ts",
    ],
  },
  // Trigger.dev tasks and CLI scripts are server-side; console output is the
  // legitimate channel for run logs and operator output.
  {
    files: ["trigger/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // Tests are allowed looser typing for mocks and console output for diagnostic
  // logging during failures.
  {
    files: ["tests/**/*.{ts,tsx}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
