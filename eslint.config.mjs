import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["src/**/*.tsx"], rules: { "no-restricted-syntax": ["error", {
    selector: "JSXOpeningElement[name.name='select']",
    message: "Use TeacherCo's Select or SearchableSelect component for dropdowns.",
  }] } },
  globalIgnores([".next/**", "public/sw.js", "coverage/**", "test-results/**"]),
]);
