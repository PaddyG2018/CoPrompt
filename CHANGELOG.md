# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2024-07-27

### Major Refinements & Stability Enhancements

#### Added

- **New Build System:** Implemented a Webpack-based build process (`webpack.config.cjs`) for improved reliability, maintainability, and optimized production builds. Scripts in `package.json` updated accordingly.
- **Advanced Logging Framework:** Introduced a new logger (`utils/logger.js`) with log levels, context, session IDs, rate limiting, and sensitive data sanitization (e.g., API keys) for console logs.
- **Dedicated API Key Security Module:** API key encryption/decryption logic refactored into `utils/secureApiKey.js`.
- **Helper Utilities:** Added `utils/helpers.js` for common functions like `generateUniqueId`.
- **Code Review Document:** Added detailed code review notes for this update cycle (`reviews/feature_telemetry_integration_review.md`).

#### Changed

- **Prompt Enhancement Engine:**
  - Updated the main system instruction (`MAIN_SYSTEM_INSTRUCTION`) for significantly improved context-awareness, quality, and structure of enhanced prompts.
  - Implemented `MAX_CONTEXT_ITEMS` to control and limit conversation history sent to the LLM.
  - Removed outdated prompt categorization logic, focusing on a unified enhancement strategy.
- **Security & API Key Handling:**
  - **Centralized API Calls:** All OpenAI API calls for prompt enhancement are now exclusively handled by the background service worker (`background.js`).
  - **Enhanced API Key Protection:** The decrypted API key is only handled within `background.js` immediately before an API call. The injected script (`injected.js`) no longer requests or handles API keys for the core enhancement flow.
  - **Reduced Attack Surface:** Minimized `web_accessible_resources` in `manifest.json` to only essential scripts (`injected.js`).
- **Internal Messaging Architecture:**
  - Refactored the primary enhancement request flow to use a more robust port-based communication channel between content scripts (`content/messageHandler.js`) and the background service worker.
  - `injected.js` now primarily acts as a UI/DOM interaction layer, delegating enhancement logic.
  - Improved request tracking using `requestId`.
- **Code Structure & Maintainability:**
  - Numerous instances of dead code removed (e.g., old API key retrieval flow, unused functions in `injected.js` and `content/messageHandler.js`).
  - Removed unused imports and constants across various files (e.g., `utils/constants.js`, `injected.js`, `content/interactionHandler.js`).
  - Webpack `mode` is now configurable via `NODE_ENV` for easier development and production builds.
- **UI & UX:**
  - Restored pulsing dots animation for the "Enhancing" button state.
  - Removed ellipsis from "Enhancing" button label (`ENHANCING_LABEL` in `utils/constants.js`).
  - Quieted excessive console logging from DOM utility functions (`utils/domUtils.js`) during normal operation.

#### Fixed

- **Error Handling:** Improved error checking for port connections between content scripts and the background service worker, particularly for "Extension context invalidated" scenarios.
- Resolved an issue where `injected.js` was attempting to import constants it no longer used, which could fail due to manifest changes.

### Added

- Support for the Lovable AI web app builder ([lovable.dev](https://lovable.dev)).

## [0.3.0] - 2024-05-01

### Changed

- **Major Refactoring (Phases 1-4 Complete):**
  - Externalized system prompt constants (`utils/constants.js`).
  - Externalized all button/container CSS (`content.css`), removing inline styles.
  - Modularized content script logic:
    - DOM utilities (`utils/domUtils.js`).
    - Platform context extraction (`content/contextExtractor.js`).
    - Window message handling (`content/messageHandler.js`).
  - Refactored drag-and-drop feature (`content/interactionHandler.js`):
    - Migrated to Pointer Events.
    - Encapsulated state.
    - Improved click vs. drag detection reliability.
    - Fixed boundary constraints and jerky movement bugs.
    - Corrected click target area and cursor behavior.
  - Refactored background script API call logic (`background/apiClient.js`).
  - Simplified injected script (`injected.js`) event handling.
  - Added build process (`npm run build:prod`, `npm run package`) to manage `DEBUG` flags.
  - Added `DEVELOPMENT.md` with build/release instructions.

### Fixed

- Resolved numerous bugs related to floating button drag/drop behavior.
- Fixed issue where button click area was larger than the visible button.
- Corrected inconsistent cursor behavior during/after drag.
- Ensured button respects viewport boundaries correctly.

## [1.0.0] - YYYY-MM-DD

### Added

- Initial release.

## [0.2.1] - 2025-05-01

### Changed

- Switched prompt enhancement API model from `gpt-4-turbo` to `gpt-4.1-mini` to improve prompt enhancement quality and latency.

## [0.2.0] - 2025-04-22

### Added

- No major additions, focus on internal improvements.

### Changed

- Improved prompt enhancement engine logic
- Switched prompt enhancement API model from `gpt-4-turbo` to `gpt-4o`.

### Fixed

- Significantly reduced prompt enhancement latency (back to 2-5s range) due to model switch.

## [0.1.2] - 2025-04-10

### Fixed

- Resolve context capture, API fetch, and JS errors
