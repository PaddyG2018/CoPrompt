import globals from "globals";
import pluginSecurity from "eslint-plugin-security";
import eslintConfigPrettier from "eslint-config-prettier";
import js from "@eslint/js";

export default [
  // Base ESLint recommended rules
  js.configs.recommended,

  // Security plugin configuration
  pluginSecurity.configs.recommended,

  // Configuration specific to browser JS files
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    plugins: {
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

      // JavaScript rules
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },

  // Configuration specific for Node.js scripts
  {
    files: ["scripts/**/*.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    plugins: {
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

      // JavaScript rules
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },

  // Configuration specific for webpack.config.cjs
  {
    files: ["webpack.config.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // No specific rules needed for webpack config
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
      "supabase/functions/", // Ignore TypeScript files in Deno environment
    ],
  },
];