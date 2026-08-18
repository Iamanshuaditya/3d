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
    // Vendored Google Draco decoder used by GLTFLoader. This is generated
    // third-party code, not application source.
    "public/draco/**",
    // Scratch area holding cloned third-party repos used while researching
    // UV onboarding. Not application source.
    "experiments/**",
  ]),
]);

export default eslintConfig;
