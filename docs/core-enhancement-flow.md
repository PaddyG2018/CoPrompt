# Core Prompt Enhancement Flow (v0.4 - Unique ID & Direct Click Handling)

This document outlines the communication flow for the core feature where a user clicks the 'Enhance' button next to a text input field, incorporating the Unique Request ID pattern.

**Goal:** To take the text from the input field, send it to a background process for enhancement (via OpenAI API), receive the enhanced text, update the original input field, and robustly manage the button state for the specific request.

**Core Components:**

*   `injected.js`: Runs in the page context, defines `window.enhancePrompt`, handles the *response* (`CoPromptEnhanceResponse`), updates the input field (`domUtils.updateInputElement`), and resets the button state (`resetButtonState`).
*   `content/messageHandler.js`: Content script acting as a bridge, listens for messages from `injected.js` (`CoPromptEnhanceRequest`), communicates with `background.js` via long-lived ports (`chrome.runtime.connect`).
*   `content/interactionHandler.js`: Content script handling drag-and-drop logic for the button via `makeDraggable`. **Detects clicks**, initiates the enhancement flow.
*   `content/domUtils.js`: Content script utilities for finding and updating input elements.
*   `content/contextExtractor.js`: Content script utility for extracting conversation context.
*   `utils/helpers.js`: Shared utility functions (e.g., `generateUniqueId`).
*   `background.js`: Service worker, listens for port connections, handles API key retrieval/decryption, calls the OpenAI API via `background/apiClient.js`, sends results back via the port including the `requestId`.

**Communication Flow:**

1.  **Button Creation & ID Assignment (`content.js`):**
    *   `createFloatingButton` is called when an input field is detected.
    *   It imports `generateUniqueId` from `utils/helpers.js`.
    *   It generates a `requestId = generateUniqueId()`.
    *   It assigns the ID to the button: `button.dataset.coPromptRequestId = requestId;`.
    *   It calls `makeDraggable` from `interactionHandler.js` to attach drag/click listeners.
2.  **Button Click & Request Initiation (`interactionHandler.js`):**
    *   User clicks the 'Enhance' button.
    *   `makeDraggable` logic determines the interaction was a click (not a drag).
    *   The click handler (within `makeDraggable`, e.g., in `closeDragElement`):
        *   Retrieves the button element (`elmnt`) and its `requestId` from `elmnt.dataset.coPromptRequestId`.
        *   Imports and calls `findActiveInputElementValue()` from `domUtils.js` to get the current `prompt`.
        *   Checks if `requestId` and `prompt` are valid.
        *   Sets the button state to 'Enhancing...': updates `textContent`, disables button, adds `.coprompt-loading` class.
        *   **Directly calls `window.enhancePrompt(prompt, requestId);` defined in `injected.js`.**
3.  **Request Propagation (`injected.js` -> `messageHandler.js`):**
    *   `window.enhancePrompt` determines the prompt category (locally) and system instruction.
    *   It sends a `CoPromptEnhanceRequest` message via `window.postMessage`, containing the `prompt`, `systemInstruction`, and the `requestId`.
4.  **Content Script Bridge (`messageHandler.js` -> `background.js`):**
    *   A global message listener (`handleWindowMessage`) in `messageHandler.js` receives the `CoPromptEnhanceRequest`.
    *   It extracts the `prompt`, `systemInstruction`, and `requestId`.
    *   It establishes a long-lived port connection to `background.js` (`chrome.runtime.connect({ name: "enhancer" })`).
    *   It sends an `ENHANCE_PROMPT` message via the port, including the `prompt`, `systemInstruction`, `requestId`, and potentially extracted conversation context.
    *   It sets up listeners (`onMessage`, `onDisconnect`) on the port for the response or errors.
5.  **Background Processing (`background.js`):**
    *   `chrome.runtime.onConnect` listener accepts the connection.
    *   The `port.onMessage` listener receives the `ENHANCE_PROMPT` message, including the `requestId`.
    *   It retrieves and decrypts the API key.
    *   It calls `callOpenAI` with the key, prompt, instructions, and context.
    *   It receives the enhanced prompt (`result`) or an error.
    *   It sends a message back via the port including the original `requestId`: `{ type: "CoPromptEnhanceResponse", data: result, requestId: message.requestId }` or `{ type: "CoPromptErrorResponse", error: ..., requestId: message.requestId }`.
6.  **Response Bridge (`background.js` -> `messageHandler.js`):**
    *   The `port.onMessage` listener in `messageHandler.js` receives the response from the background, including the `requestId`.
    *   It sends a `CoPromptEnhanceResponse` message via `window.postMessage`, containing the `requestId` and either `error: response.error` or `enhancedPrompt: response.data`.
    *   It disconnects the port.
7.  **Updating the UI (`messageHandler.js` -> `injected.js`):**
    *   The global message listener in `injected.js` receives the `CoPromptEnhanceResponse` message.
    *   It extracts the `requestId`, `enhancedPrompt`, or `error`.
    *   **It finds the specific button using the received `requestId`: `document.querySelector(\`button[data-co-prompt-request-id="${requestId}"]\`)`.**
    *   If an error occurred, it shows an alert (or uses a better notification method) and calls `resetButtonState(buttonToReset)`.
    *   If successful:
        *   It finds the active input element (`findActiveInputElement`).
        *   It updates the input element's content (`updateInputElement`).
        *   It calls `resetButtonState(buttonToReset)`.

**Key Design Choices (Post-Refactor & Unique ID):**

*   **Direct Click Handling:** Click detection and initial state change happen within `interactionHandler.js` for better consolidation.
*   **Unique Request ID:** Ensures each request flow is tied to the specific button instance that initiated it, making state management (especially reset) robust.
*   **Long-Lived Ports:** Used for `messageHandler.js` <-> `background.js`.
*   **`window.postMessage`:** Used for `injected.js` <-> `messageHandler.js` and now potentially `interactionHandler.js` -> `injected.js` (via `window.enhancePrompt`).
*   **Targeted Reset:** The button reset logic in `injected.js` uses the `requestId` from the response message to find and reset the correct button.

**(Self-Correction during planning):** Removed the `CoPromptButtonClicked` message flow as it's redundant with direct handling in `interactionHandler.js`. Updated Unique ID section to reflect ID generation in `content.js`.

## Proposed Robust Button Reset Solution: Unique Request ID

**Problem:** Relying on a shared global variable (`enhanceButton`) or simple DOM queries to find the button to reset within the asynchronous message handler is fragile and prone to `ReferenceError` or incorrect targeting.

**Solution:** Associate each request with the specific button instance using a unique ID.

**Implementation Steps:**

1.  **Generate Unique ID (`injected.js`):**
    *   Create a simple utility function `generateUniqueId()` (e.g., using `Date.now().toString(36) + Math.random().toString(36).substring(2)`).
2.  **Assign ID on Button Creation (`addEnhanceButton` in `injected.js`):**
    *   When creating the button element, generate an ID: `const requestId = generateUniqueId();`
    *   Store this ID on the button element itself using a data attribute: `enhanceButton.dataset.coPromptRequestId = requestId;`.
3.  **Include ID in Request (`onclick` in `injected.js`):**
    *   Read the ID from the clicked button: `const requestId = event.target.dataset.coPromptRequestId;`.
    *   When calling `window.enhancePrompt`, pass the `requestId` along with the `prompt`.
4.  **Propagate ID through Messages:**
    *   **`injected.js` (`window.enhancePrompt`)**: Include `requestId` in the `window.postMessage({ type: "CoPromptEnhanceRequest", ..., requestId: requestId }, "*");` payload.
    *   **`messageHandler.js` (`_handleEnhanceRequest`)**: Extract `requestId` from `event.data` and include it in the `port.postMessage({ type: "ENHANCE_PROMPT", ..., requestId: requestId });` payload.
    *   **`background.js` (`port.onMessage`)**: Extract `requestId` from the incoming `message`.
    *   **`background.js` (`port.onMessage`)**: Include the original `requestId` in the response message sent back via the port: `port.postMessage({ type: "CoPromptEnhanceResponse", ..., requestId: message.requestId });` (and similarly for error responses).
    *   **`messageHandler.js` (`port.onMessage`)**: Extract `requestId` from the `response` and include it in the final `window.postMessage({ type: "CoPromptEnhanceResponse", ..., requestId: response.requestId }, "*");` payload.
5.  **Targeted Reset (Global Listener in `injected.js`):**
    *   In the `case "CoPromptEnhanceResponse":` block, extract the `requestId` from `event.data`.
    *   Find the specific button using the ID: `const buttonToReset = document.querySelector(\`button[data-co-prompt-request-id="${event.data.requestId}"]\`);`.
    *   Check if `buttonToReset` was found.
    *   Modify `resetButtonState` to accept the button element as an argument: `function resetButtonState(buttonElement) { ... }`.
    *   Call the modified reset function with the found button: `resetButtonState(buttonToReset);`.
6.  **Modify `resetButtonState` (`injected.js`):**
    *   Update the function signature: `function resetButtonState(buttonElement)`.
    *   Perform all checks and DOM manipulations directly on the passed `buttonElement` parameter, removing reliance on any global `enhanceButton` variable.

**Benefits:**

*   Eliminates fragile global state for button references.
*   Ensures the correct button instance is always targeted for reset.
*   Resilient to timing issues and asynchronous operations. 