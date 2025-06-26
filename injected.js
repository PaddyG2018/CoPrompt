// Removed import of constants as they are unused in injected.js

// --- Utility Functions ---
// REMOVED generateUniqueId - consolidated in utils/helpers.js

// --- Constants for button states ---
// const DEFAULT_SYSTEM_INSTRUCTION = "Default instruction..."; // REMOVE placeholder
// const CODE_SYSTEM_INSTRUCTION = "Code instruction...";       // REMOVE placeholder
const IMPROVE_LABEL_WITH_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
    <path d="M20 3v4"></path>
    <path d="M22 5h-4"></path>
    <path d="M4 17v2"></path>
    <path d="M5 18H3"></path>
  </svg>
  Improve Prompt
`;
const ENHANCING_LABEL = "Enhancing...";

// --- Top-level state variables ---
// Removed enhanceButton, ORIGINAL_LABEL, ENHANCING_LABEL - they will be handled differently or locally
// let enhanceButton = null;
// const ORIGINAL_LABEL = 'Enhance';
// const ENHANCING_LABEL = 'Enhancing...';

// Simple flag - injected scripts don't have easy access to manifest
// Assume production logging unless specifically enabled for debug builds
const DEBUG = false;

// console.log("[CoPrompt Injected] Reached point before enhancePrompt definition."); // <-- REMOVE log before

// Modified enhancePrompt: Sends request TO content script, doesn't handle response directly
window.enhancePrompt = async (promptText, conversationContext, requestId) => {
  // Removed port parameter
  if (DEBUG)
    console.log(
      "enhancePrompt called with:",
      promptText,
      "Context:",
      conversationContext,
      "ID:",
      requestId,
    );

  try {
    // Post message TO content script (which will then talk to background)
    window.postMessage(
      {
        type: "CoPromptEnhanceRequest", // Use a specific type for this direction
        prompt: promptText,
        context: conversationContext,
        requestId: requestId, // Include requestId
      },
      "*",
    );
  } catch (error) {
    console.error(
      "Error posting enhance request message to content script:",
      error,
    );
    // Reset button locally if possible? Find button by ID.
    const buttonToReset = document.querySelector(
      `button[data-co-prompt-request-id="${requestId}"]`,
    );
    resetButtonState(buttonToReset); // Use existing reset function
  }
};

// console.log("[CoPrompt Injected] Reached point AFTER enhancePrompt definition."); // <-- REMOVE log after

// --- Global Message Listener ---
// (Combine with existing listener if any, e.g., from getAPIKeyFromContentScript)
window.addEventListener("message", (event) => {
  // Basic validation
  if (event.source !== window || !event.data?.type) {
    return;
  }

  // Log relevant messages if debugging
  // if (DEBUG && event.data.type?.startsWith('CoPrompt')) { // Keep conditional DEBUG log
  //   console.log("[Injected Listener] Received:", event.data);
  // }

  const { type, payload, requestId } = event.data;

  switch (type) {
    case "CoPromptExecuteEnhance": // Listen for trigger from content script
      // console.log("[Injected Listener] Received CoPromptExecuteEnhance, calling enhancePrompt..."); // REMOVE log
      // Ensure enhancePrompt is available (should be, as this script defines it)
      if (typeof enhancePrompt === "function") {
        // Call enhancePrompt with data from content script's message
        enhancePrompt(
          event.data.prompt,
          event.data.context,
          event.data.requestId,
        );
      } else {
        console.error(
          "[Injected Listener] enhancePrompt function not found locally!",
        );
      }
      break;

    case "CoPromptEnhanceResponse":
      // console.log("[Injected Listener] Handling CoPromptEnhanceResponse"); // REMOVE log
      const responseRequestId = event.data.requestId;
      if (!responseRequestId) {
        console.error(
          "Enhance response missing requestId. Cannot reset button.",
          event.data,
        );
        // Might still try to update input if possible?
        // updateInputElement(findActiveInputElement(), event.data.enhancedPrompt);
        return; // Cannot reliably reset button
      }
      // console.log(`[Injected Listener] Response received for Request ID: ${responseRequestId}`); // REMOVE log

      // Find the specific button associated with this request
      const buttonToReset = document.querySelector(
        `button[data-co-prompt-request-id="${responseRequestId}"]`,
      );
      if (!buttonToReset) {
        console.warn(
          `Button with ID ${responseRequestId} not found for reset.`,
        );
      }

      // Check for error from background
      if (event.data.error) {
        console.error(
          `Error received from background (ID: ${responseRequestId}):`,
          event.data.error,
        );
        alert(`Enhancement failed: ${event.data.error}`);
        // console.log(`[Injected Listener] Calling resetButtonState for button ID ${responseRequestId} after error.`); // REMOVE log
        resetButtonState(buttonToReset); // Pass the found button (or null if not found)
        return;
      }

      // Process successful response
      const enhancedPrompt = event.data.data;
      // console.log(`[Injected Listener] Got enhancedPrompt (length: ${enhancedPrompt?.length}) for ID ${responseRequestId}`); // REMOVE log
      if (enhancedPrompt) {
        // console.log(`[Injected Listener] Finding active input element for ID ${responseRequestId}...`); // REMOVE log
        const inputElement = findActiveInputElement(); // Input finding is independent of button ID
        if (inputElement) {
          // console.log(`[Injected Listener] Input element found. Calling updateInputElement for ID ${responseRequestId}...`); // REMOVE log
          updateInputElement(inputElement, enhancedPrompt);
          // console.log(`[Injected Listener] updateInputElement finished for ID ${responseRequestId}.`); // REMOVE log
        } else {
          console.error(
            `[Injected Listener] Could not find active input element to update for ID ${responseRequestId}.`,
          );
          window.postMessage(
            {
              type: "CoPromptReportError",
              detail: {
                code: "E_NO_INPUT_FIELD",
                message:
                  "Could not find active input element after enhance response",
                requestId: responseRequestId,
              },
            },
            "*",
          );
        }
      } else {
        console.warn(
          `[Injected Listener] Received CoPromptEnhanceResponse but the enhanced prompt string was empty for ID ${responseRequestId}.`,
        );
        alert("Enhancement resulted in an empty prompt.");
      }
      // console.log(`[Injected Listener] Calling resetButtonState for button ID ${responseRequestId} after success/empty response.`); // REMOVE log
      resetButtonState(buttonToReset); // Pass the found button (or null if not found)
      // console.log(`[Injected Listener] resetButtonState finished for ID ${responseRequestId}.`); // REMOVE log
      break;

    case "CoPromptErrorResponse": // Ensure error responses also have requestId
      // console.log("[Injected Listener] Handling CoPromptErrorResponse"); // REMOVE log
      const errorRequestId = event.data.requestId; // Use consistent destructuring
      // Find button by errorRequestId, show error, reset button
      const errorButtonToReset = document.querySelector(
        `button[data-co-prompt-request-id="${errorRequestId}"]`,
      );
      if (!errorButtonToReset) {
        console.warn(
          `Button with ID ${errorRequestId} not found for reset after error.`,
        );
      }
      alert(`Enhancement failed: ${event.data.error || "Unknown error"}`);
      resetButtonState(errorButtonToReset); // Pass the found button (or null if not found)
      break;

    default:
      // Ignore unknown message types
      break;
  }
});

// --- DOM Manipulation & Button Logic ---

// Function to update the input field (Handles different input types)
function updateInputElement(element, text) {
  // console.log(`[UPDATE_INPUT_DEBUG] Attempting to update element with text (length: ${text.length})`, element); // REMOVE log
  if (!element) {
    // console.warn("[UPDATE_INPUT_DEBUG] Update failed: Element is null."); // REMOVE log
    return;
  }

  try {
    // console.log(`[UPDATE_INPUT_DEBUG] Element tagName: ${element.tagName}, isContentEditable: ${element.isContentEditable}`); // REMOVE log
    // Check if the element is a standard input or textarea
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      // console.log("[UPDATE_INPUT_DEBUG] Updating INPUT/TEXTAREA value."); // REMOVE log
      element.value = text;
      // Dispatch input event to trigger any framework listeners (React, Vue, etc.)
      // console.log("[UPDATE_INPUT_DEBUG] Dispatching input event for INPUT/TEXTAREA."); // REMOVE log
      element.dispatchEvent(
        new Event("input", { bubbles: true, cancelable: true }),
      );
      // console.log("[UPDATE_INPUT_DEBUG] INPUT/TEXTAREA update complete."); // REMOVE log
    }
    // Check if the element is contenteditable
    else if (element.isContentEditable) {
      // console.log("[UPDATE_INPUT_DEBUG] Element is contenteditable. Focusing..."); // REMOVE log
      element.focus();
      // *** FIX: Select existing content before inserting ***
      document.execCommand("selectAll", false, null);
      // *** END FIX ***
      // console.log("[UPDATE_INPUT_DEBUG] Calling execCommand('insertText')...); // REMOVE log
      const success = document.execCommand("insertText", false, text);
      // console.log(`[UPDATE_INPUT_DEBUG] execCommand success: ${success}`); // REMOVE log
      if (success) {
        // console.log("[UPDATE_INPUT_DEBUG] execCommand succeeded."); // REMOVE log
      } else {
        console.error(
          "[UPDATE_INPUT_DEBUG] execCommand returned false. Falling back to textContent.",
        ); // Keep Error
        const errorMsg = "execCommand('insertText') returned false.";
        window.postMessage(
          {
            type: "CoPromptReportError",
            detail: {
              code: "E_UPDATE_INPUT_FAILED",
              message: errorMsg,
              context: "execCommand returned false",
            },
          },
          "*",
        );
        element.textContent = text;
        // console.log("[UPDATE_INPUT_DEBUG] Dispatching input event for fallback."); // REMOVE log
        element.dispatchEvent(
          new Event("input", { bubbles: true, cancelable: true }),
        );
        // console.log("[UPDATE_INPUT_DEBUG] textContent fallback complete."); // REMOVE log
      }
    } else {
      console.warn(
        "[UPDATE_INPUT_DEBUG] Element is not an input, textarea, or contenteditable.",
      ); // Keep Warn
    }
    // console.log("[UPDATE_INPUT_DEBUG] Try block finished successfully."); // REMOVE log
  } catch (error) {
    console.error(
      "[UPDATE_INPUT_DEBUG] Error occurred during updateInputElement:",
      error,
    ); // Keep Error
    window.postMessage(
      {
        type: "CoPromptReportError",
        detail: {
          code: "E_UPDATE_INPUT_FAILED",
          message: error.message,
          stack: error.stack,
        },
      },
      "*",
    );
  }
}

// Helper to get active input value/textContent
function findActiveInputElementValue() {
  const element = findActiveInputElement();
  if (!element) return null;
  return element.value !== undefined ? element.value : element.textContent;
}

// Function to reset the button state - ACCEPTS BUTTON ELEMENT
function resetButtonState(button) {
  // const logResetDebug = (...args) => DEBUG && console.log('[RESET_BUTTON_DEBUG]', ...args); // REMOVE debug helper
  // const logWarnDebug = (...args) => console.warn('[RESET_BUTTON_WARN]', ...args); // REMOVE debug helper
  const logResetError = (...args) =>
    console.error("[RESET_BUTTON_ERROR]", ...args); // Keep Error helper or replace with direct console.error

  // logResetDebug(`resetButtonState called for button:`, button); // REMOVE log

  if (button && button.tagName === "BUTTON") {
    try {
      // logResetDebug("Valid button passed. Attempting reset..."); // REMOVE log
      // Reset the specific button passed as argument
      button.disabled = false;
      button.style.cursor = "pointer";
      button.classList.remove("coprompt-loading");
      // Restore original background color if needed, or rely on CSS
      // button.style.backgroundColor = "#6a0dad"; // Example original color

      // --- Reconstruct content safely --- START ---
      // 1. Clear existing content
      button.textContent = "";

      // 2. Create SVG element
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.classList.add("lucide", "lucide-sparkles"); // Add classes if needed

      // *** START FIX for TrustedHTML ***
      // 3. Set SVG paths using DOM manipulation (avoids innerHTML)
      const path1 = document.createElementNS(svgNS, "path");
      path1.setAttribute(
        "d",
        "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
      );
      svg.appendChild(path1);

      const path2 = document.createElementNS(svgNS, "path");
      path2.setAttribute("d", "M20 3v4");
      svg.appendChild(path2);

      const path3 = document.createElementNS(svgNS, "path");
      path3.setAttribute("d", "M22 5h-4");
      svg.appendChild(path3);

      const path4 = document.createElementNS(svgNS, "path");
      path4.setAttribute("d", "M4 17v2");
      svg.appendChild(path4);

      const path5 = document.createElementNS(svgNS, "path");
      path5.setAttribute("d", "M5 18H3");
      svg.appendChild(path5);
      // *** END FIX for TrustedHTML ***

      // 4. Create text node
      const textNode = document.createTextNode(" Improve Prompt"); // Add leading space if needed

      // 5. Append SVG and text node to the button
      button.appendChild(svg);
      button.appendChild(textNode);
      // --- Reconstruct content safely --- END ---

      // logResetDebug(`Button reset complete: Disabled=false, Content set programmatically.`); // REMOVE log
    } catch (error) {
      logResetError(
        `[CoPrompt Injected Error] E_BUTTON_RESET_FAILED: Error resetting button state: ${error.message}`,
        error,
      );
      window.postMessage(
        {
          type: "CoPromptReportError",
          detail: {
            code: "E_BUTTON_RESET_FAILED",
            message: error.message,
            stack: error.stack,
            context: "programmatic reset",
          },
        },
        "*",
      );
      // Fallback: Just set text
      button.textContent = "Improve Prompt";
      button.disabled = false;
      button.style.cursor = "pointer";
      button.classList.remove("coprompt-loading");
    }
  } else {
    console.warn(
      "[RESET_BUTTON_DEBUG] Reset skipped: Invalid or null button passed.",
      button,
    ); // Keep Warn
  }
}

// Function to find the currently focused or relevant input/textarea
function findActiveInputElement() {
  // console.log("[FIND_INPUT_DEBUG] Attempting to find active input element..."); // REMOVE log
  try {
    // Use a broader set of selectors, matching domUtils.js logic if possible
    // *** UPDATED SELECTOR to include Gemini's structure ***
    const element = document.querySelector(
      '#prompt-textarea[contenteditable="true"], ' + // ChatGPT ID
        'div.ProseMirror[contenteditable="true"], ' + // ChatGPT Class & Claude Class
        'div.ql-editor[contenteditable="true"], ' + // Gemini Class
        'textarea[placeholder*="ask"], textarea[placeholder*="prompt"], textarea[placeholder*="chat"], ' + // Lovable placeholders
        '.chat-input textarea, .prompt-input textarea, .message-input textarea, ' + // Lovable class patterns
        '[data-testid*="chat-input"], [data-testid*="prompt-input"], ' + // Lovable test IDs
        'textarea:not([style*="display: none"]):not([disabled])', // General fallback (visible, enabled textarea)
    );

    if (!element) {
      console.error(
        "[FIND_INPUT_DEBUG] No suitable input element found with the refined selector.",
      ); // Keep Error
      // Try a simpler fallback just in case? (Might re-introduce the original issue)
      const fallbackElement = document.querySelector(
        '#prompt-textarea, textarea, div[contenteditable="true"]',
      ); // Broader fallback
      if (fallbackElement) {
        console.warn(
          "[FIND_INPUT_DEBUG] Refined selector failed, but found an element with fallback selector:",
          fallbackElement,
        ); // Keep Warn
        // Basic visibility check for fallback
        if (
          fallbackElement.offsetParent === null &&
          fallbackElement.tagName !== "TEXTAREA"
        ) {
          console.warn(
            "[FIND_INPUT_DEBUG] Fallback element might be hidden (offsetParent is null). Rejecting fallback.",
          ); // Keep Warn
          return null;
        }
        return fallbackElement; // Return the fallback cautiously
      } else {
        console.error("[FIND_INPUT_DEBUG] Fallback selector also failed."); // Keep Error
        // window.postMessage({ type: "CoPromptReportError", detail: { code: 'E_NO_INPUT_FIELD', message: 'No suitable active input element found even with fallback.' } }, "*");
        return null; // Explicitly return null
      }
    }

    // Add visibility check if needed (inline style check is now part of selector)
    // Offset parent check can still be useful for other forms of hiding
    if (element.offsetParent === null && element.tagName !== "TEXTAREA") {
      console.warn(
        "[FIND_INPUT_DEBUG] Found element, but offsetParent is null (might be hidden):",
        element,
      ); // Keep Warn
      // return null; // Decide if offsetParent check should prevent return
    }

    // console.log("[FIND_INPUT_DEBUG] Found potential element with refined selector:", element); // REMOVE log
    return element;
  } catch (error) {
    console.error(
      "[FIND_INPUT_DEBUG] Error occurred during findActiveInputElement:",
      error,
    ); // Keep Error
    window.postMessage(
      {
        type: "CoPromptReportError",
        detail: {
          code: "E_FIND_INPUT_ERROR",
          message: `Error finding input element: ${error.message}`,
          stack: error.stack,
        },
      },
      "*",
    );
    return null; // Return null on error
  }
}

// MutationObserver logic to detect input fields
// ... (observer logic remains the same) ...

// Initial check for input fields on script load
// ... (initial check logic) ...

// --- FINAL CONFIRMATION LOG ---
// console.log("[CoPrompt Injected] Script execution completed. window.enhancePrompt should be defined.");
