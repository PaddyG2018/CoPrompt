# CoPrompt Development & Release Guide

This document outlines the process for developing, testing, and packaging the CoPrompt browser extension.

## Development

1.  **Install Dependencies:** `npm install`
2.  **Run Development Server:** `npm run start`
    *   This uses `web-ext run` to load the extension directly from the source files in your workspace into a temporary Firefox profile (or Chromium if configured).
    *   Changes to source files will often be reflected automatically upon reloading the extension (Ctrl+R or Cmd+R in the browser's extension management page).
    *   During development, you can set `const DEBUG = true;` in relevant `.js` files (`background.js`, `content.js`, etc.) to enable verbose logging in the browser console and background script console.

## Building for Production

There are two main build targets:

1.  **`npm run build:prod`**: 
    *   This command cleans the `dist/` directory.
    *   It copies all necessary source files (`.js`, `.html`, `.css`, `manifest.json`, `icons/`, `utils/`, etc.) into the `dist/` directory.
    *   Crucially, it then modifies the `.js` files within `dist/` to ensure `const DEBUG = false;` is set, disabling verbose logs for the production version.
    *   The `dist/` directory now contains the production-ready unpacked extension code.
    *   **Use Case:** You can load this `dist/` directory as an unpacked extension in Chrome/Firefox to test the exact code that will be packaged, ensuring the `DEBUG` flags are correctly set to `false`.

2.  **`npm run build:dev`**: (Less common)
    *   This simply cleans `dist/` and copies the source files without modifying the `DEBUG` flags.
    *   **Use Case:** Primarily for testing the file copying process itself.

## Packaging for Release

1.  **Run Package Script:** `npm run package`
    *   This command first executes `npm run build:prod` to create the clean, production-ready code in the `dist/` directory.
    *   Then, it uses `web-ext build` to bundle the contents of the `dist/` directory into a distributable package file (`.zip` for Chrome, potentially `.xpi` for Firefox).
    *   The final package file will be located in the `web-ext-artifacts/` directory (which is ignored by Git).
    *   This artifact is the file you upload to the Chrome Web Store, Firefox Add-ons website, etc.

## Cleaning

*   **`npm run clean`**: Removes the `dist/` directory. 