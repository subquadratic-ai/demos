// Flat config wrapping eslint-config-next (which still ships legacy config).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Fonts are linked from app/layout.tsx, which covers every page; this
    // rule targets the pages router's _document.js.
    rules: { "@next/next/no-page-custom-font": "off" },
  },
];

export default eslintConfig;
