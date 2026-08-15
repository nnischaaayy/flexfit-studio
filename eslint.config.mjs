import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["drizzle/**", "drizzle-test/**", "test/**"],
  },
  {
    rules: {
      // `const { passwordHash: _omit, ...safe } = user` is a deliberate
      // destructure-to-strip-a-field pattern (see members.ts) — the `_`
      // prefix marks it as intentionally unused, not dead code.
      "@typescript-eslint/no-unused-vars": ["warn", { varsIgnorePattern: "^_" }],
    },
  },
];

export default eslintConfig;
