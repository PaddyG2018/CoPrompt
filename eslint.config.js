import globals from "globals";
import tseslint from "typescript-eslint";
import pluginSecurity from "eslint-plugin-security";
import eslintConfigPrettier from "eslint-config-prettier";
import path from "path";
import { fileURLToPath } from "url";

// Mimic __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
  // Base ESLint recommended rules
  // eslint.configs.recommended, // Included via plugin security apparently

  // TypeScript recommended rules
  // Using .configs.recommended includes base ESLint recommended rules
  ...tseslint.configs.recommended, // Use standard recommended rules

  // Security plugin configuration
  pluginSecurity.configs.recommended,

  // Configuration specific to JS/TS files
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
      // ParserOptions are needed only for type-aware rules
      // parserOptions: {
      //   project: true,
      //   tsconfigRootDir: __dirname,
      // },
    },
    plugins: {
      // Ensure plugins are explicitly defined for this configuration block
      "@typescript-eslint": tseslint.plugin,
      security: pluginSecurity,
    },
    rules: {
      // Your specific rule overrides from .eslintrc.json
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",

      // Security plugin rules (already included by recommended, but can override here)
      "security/detect-object-injection": "warn",
      "security/detect-child-process": "off", // Temporarily disable due to crash in ESLint v9
      "security/detect-non-literal-fs-filename": "off", // Temporarily disable due to crash in ESLint v9

      // TypeScript specific rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],

      // Removed type-aware rules as they require project parsing
      // "@typescript-eslint/no-floating-promises": "error",
      // "@typescript-eslint/no-misused-promises": "error",
    },
  },

  // Configuration specific for webpack.config.cjs
  {
    files: ["webpack.config.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      // Potentially also disable sourceType: "module" if it causes issues for .cjs
      // but usually, just disabling no-require-imports is enough.
      // We might also need to set sourceType: "commonjs" explicitly here if ESLint
      // tries to parse it as a module due to global settings.
    },
  },

  // Disable rules conflicting with Prettier - MUST BE LAST
  eslintConfigPrettier,

  // Global ignores from .eslintignore
  {
    ignores: [
      "node_modules/",
      "dist/",
      "web-ext-artifacts/",
      ".DS_Store",
      "*.log",
      "*.tmp",
      "*.swp",
      "utils/dompurify.min.js",
      "eslint.config.js", // Ignore the config file itself
      "lib/", // Added to ignore the vendored Supabase library
      "test/enhance_auth_tests/", // Ignore test files that use CommonJS require()
    ],
  },
);
