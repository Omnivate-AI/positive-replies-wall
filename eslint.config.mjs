import js from "@eslint/js";
import next from "eslint-config-next";
import tseslint from "typescript-eslint";

/**
 * Flat ESLint config (ESLint v9+).
 * Stack:
 *   - @eslint/js recommended (general JS)
 *   - typescript-eslint recommended (TS-specific)
 *   - eslint-config-next (Next.js + React + a11y)
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
      // Generated fixture; mojibake intentional in JSON-encoded body strings
      "app/m7/data/quiz.ts",
      // Keep ESLint focused on the runtime app/components — Trigger task code,
      // tests, and scripts have their own static checks via `tsc --noEmit`
      // and vitest. Adding them here just adds noise.
      "trigger/**",
      "scripts/**",
      "tests/**",
      "vitest.config.ts",
      "trigger.config.ts",
    ],
  },
  {
    rules: {
      // The Tailwind v4 stylelint hints (e.g. `bg-(--color-bg)` shorthand) come
      // from the IDE's tailwindcss-language-server, not ESLint. We've already
      // converted those by hand. ESLint here covers TS + React + Next.js.
    },
  },
];

export default config;
