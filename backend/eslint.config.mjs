import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    // Apps Script files share one global scope: top-level functions are
    // called from other files, triggers or the editor's Run menu.
    files: ["apps-script/**/*.js"],
    languageOptions: { sourceType: "script" },
    rules: { "@typescript-eslint/no-unused-vars": ["error", { vars: "local", caughtErrors: "none" }] },
  },
);
