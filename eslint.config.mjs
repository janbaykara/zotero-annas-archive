import eslintConfig from "@zotero-plugin/eslint-config";

export default [
  ...eslintConfig,
  {
    ignores: [".scaffold/**", "build/**", "dist/**", "node_modules/**"],
  },
];
