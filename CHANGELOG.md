# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
