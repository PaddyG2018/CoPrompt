// REMOVED import { createLogger } from './utils/logger.js';

// REMOVED const logger = createLogger('content');

// Re-add simple DEBUG flag
const DEBUG = false; // Set true for development logs

// Inject `injected.js` into the page properly
const script = document.createElement("script");
// Point to the correct path relative to the manifest/dist root
script.src = chrome.runtime.getURL("injected.js");
// script.type = "module"; // Keep this commented out for now
script.onload = function () {
  // this.remove(); // Temporarily disable removing the script tag after load
}; // Remove once loaded
(document.head || document.documentElement).appendChild(script);

// --- Imports ---
// REMOVED import { DEBUG } from "./config.js";
import {
  /* findActiveInputElementValue, */ findActiveInputElement,
  updateInputElement,
} from "./utils/domUtils.js";
import { makeDraggable } from "./content/interactionHandler.js";
import { handleWindowMessage } from "./content/messageHandler.js"; // Ensure this name matches export
import { generateUniqueId } from "./utils/helpers.js";
import { ENHANCING_LABEL } from "./utils/constants.js"; // Add this import

// --- Utility Functions ---
// Debounce function to prevent rapid-fire executions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// --- Utility function to check hostname ---
function isAllowedHostname(hostname, allowedBaseDomains) {
  const lowerHostname = hostname.toLowerCase();
  for (const baseDomain of allowedBaseDomains) {
    if (
      lowerHostname === baseDomain ||
      lowerHostname.endsWith("." + baseDomain)
    ) {
      return true;
    }
  }
  return false;
}

// Track if we've already injected the button
let buttonInjected = false;

// Re-add simple debugLog function (or use DEBUG directly)
function debugLog(message, obj = null) {
  if (DEBUG) {
    const prefix = "[CoPrompt Debug]";
    if (obj) {
      console.log(prefix, message, obj);
    } else {
      console.log(prefix, message);
    }
  }
}

// Force button visibility check and repair
function checkButtonVisibility() {
  const button = document.getElementById("coprompt-button");
  if (!button) {
    debugLog("Button not found in DOM"); // Use restored debugLog
    buttonInjected = false;
    return false;
  }

  const rect = button.getBoundingClientRect();
  debugLog("Button dimensions:", {
    // Use restored debugLog
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    visible: rect.width > 0 && rect.height > 0,
  });

  // Check if button is actually visible
  const style = window.getComputedStyle(button);
  debugLog("Button computed style:", {
    // Use restored debugLog
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    zIndex: style.zIndex,
  });

  // If button exists but isn't visible, try to fix it
  if (
    rect.width === 0 ||
    rect.height === 0 ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    console.log("Button exists but is not visible, attempting to fix..."); // Reverted to console.log (info level)

    // Apply stronger styling
    button.style.display = "flex !important";
    button.style.visibility = "visible !important";
    button.style.opacity = "1 !important";
    button.style.zIndex = "9999 !important";
    button.style.position = "relative";
    button.style.backgroundColor = "#0070F3"; // Updated to blue
    button.style.color = "white";
    button.style.fontWeight = "bold";
    button.style.padding = "10px 15px";
    button.style.margin = "0 10px";
    button.style.boxShadow = "0 0 10px rgba(0, 112, 243, 0.7)"; // Updated shadow color

    return false;
  }

  return true;
}

// Debounced observer callback
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const debouncedObserverCallback = debounce(async (_mutations) => {
  // Check if the active element is suitable for the button
  const inputField = findActiveInputElement();

  if (!inputField) {
    // If no suitable input field is active, remove the button if it exists
    const existingButton = document.getElementById("coprompt-container");
    if (existingButton) {
      debugLog("No active input field, removing button.");
      existingButton.remove();
      buttonInjected = false;
    }
    return; // Exit if no suitable field
  }

  // If there IS a suitable input field, proceed with button creation/visibility checks
  if (buttonInjected && checkButtonVisibility()) return;

  if (inputField && !buttonInjected) {
    debugLog("Input field found by observer, creating floating button.");
    createFloatingButton();
  }
}, 100);

// Initialize observer only once
if (!window.coPromptObserver) {
  window.coPromptObserver = new MutationObserver(debouncedObserverCallback);

  // Observe only necessary parts of the DOM
  const observerTarget = document.querySelector("main") || document.body;
  if (observerTarget) {
    // Ensure target exists before observing
    window.coPromptObserver.observe(observerTarget, {
      childList: true,
      subtree: true,
      attributes: false, // Reduce unnecessary triggers
    });
  } else {
    console.error("Could not find main or body element to observe.");
  }
}

// Initial injection attempt
setTimeout(() => {
  // Prefer floating button
  createFloatingButton();
}, 1000); // Wait for page to fully load

// Periodic check to ensure button remains visible
setInterval(() => {
  const existingButton = document.getElementById("coprompt-button");
  const container = document.getElementById("coprompt-container");
  const targetInput = findActiveInputElement(); // Check for target input

  // If no target input exists, ensure button is removed
  if (!targetInput) {
    if (container) {
      debugLog("Periodic Check: No target input found, removing container.");
      container.remove();
      buttonInjected = false;
    }
    return;
  }

  // If target input exists, but button/container don't, try to recreate
  if ((!existingButton || !container) && targetInput) {
    debugLog(
      "Periodic Check: Button/Container not found but target exists, recreating",
    );
    buttonInjected = false;
    createFloatingButton();
    return;
  }

  // If button and container exist, proceed with visibility/position checks
  if (existingButton && container) {
    // Check if button is visible (getBoundingClientRect is sufficient)
    const rect = existingButton.getBoundingClientRect();
    const style = window.getComputedStyle(existingButton);

    // Check basic visibility properties handled by CSS
    if (
      rect.width === 0 ||
      rect.height === 0 ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      parseFloat(style.opacity) < 0.1 // Check opacity if needed
    ) {
      debugLog(
        "Periodic Check: Button exists but computed style indicates it's not visible. CSS should handle this with !important.",
      );
      // Removed direct style manipulation here
    }

    // If button is outside viewport, reset position
    // Keep this logic as it relates to position, not just visibility
    if (
      rect.top < 0 ||
      rect.left < 0 ||
      rect.top > window.innerHeight ||
      rect.left > window.innerWidth
    ) {
      debugLog("Periodic Check: Button outside viewport, resetting position");
      container.style.top = "auto";
      container.style.left = "auto";
      container.style.bottom = "80px"; // Position higher to avoid input box
      container.style.right = "20px";

      // Clear saved position
      localStorage.removeItem("coPromptButtonPosition");
    }
  }
}, 5000); // Check every 5 seconds

// Create Floating Button function
function createFloatingButton() {
  // debugLog("Creating floating CoPrompt button"); // REMOVE basic creation log

  // NEW: Find the target input field *first*
  const targetInputElement = findActiveInputElement(); // This function already logs errors/warnings
  if (!targetInputElement) {
    // debugLog("Cannot create button: No active input element found."); // REMOVE redundant log
    return; // Don't create if no target
  }

  // Check if container already exists
  let buttonContainer = document.getElementById("coprompt-container");
  if (buttonContainer) {
    debugLog("Container already exists");
    // Ensure it's visible if it was hidden
    buttonContainer.style.display = "block";
    const btn = buttonContainer.querySelector("#coprompt-button");
    if (btn) btn.style.display = "flex";
    return;
  }

  // Create container div
  buttonContainer = document.createElement("div");
  buttonContainer.id = "coprompt-container";
  // Apply container styles via CSS using ID selector

  // Restore position from localStorage if available
  try {
    const savedPosition = localStorage.getItem("coPromptButtonPosition");
    if (savedPosition) {
      const { top, left } = JSON.parse(savedPosition);
      if (top !== null && left !== null) {
        // Basic check to ensure it's within reasonable bounds
        if (
          top > 0 &&
          left > 0 &&
          top < window.innerHeight - 50 &&
          left < window.innerWidth - 50
        ) {
          buttonContainer.style.top = `${top}px`;
          buttonContainer.style.left = `${left}px`;
          buttonContainer.style.bottom = "auto";
          buttonContainer.style.right = "auto";
          debugLog("Restored button position:", top, left);
        } else {
          debugLog("Saved position out of bounds, using default.");
        }
      }
    }
  } catch (e) {
    debugLog("Failed to parse saved button position:", e);
    // Use default position if parsing fails
  }

  // Create the button
  const enhanceButton = document.createElement("button");
  enhanceButton.id = "coprompt-button";
  // Button styles applied via CSS using ID selector

  // Generate and assign unique ID (using imported function)
  const requestId = generateUniqueId();
  enhanceButton.dataset.coPromptRequestId = requestId;
  debugLog("Assigned Request ID to button in content.js:", requestId);

  // Set initial content (icon + text)
  enhanceButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
      <path d="M20 3v4"></path>
      <path d="M22 5h-4"></path>
      <path d="M4 17v2"></path>
      <path d="M5 18H3"></path>
    </svg>
    Improve Prompt
  `;
  enhanceButton.type = "button";

  buttonContainer.appendChild(enhanceButton);
  document.body.appendChild(buttonContainer);

  // --- Define the onClick handler ---
  const handleEnhanceClick = async (
    buttonElement,
    reqId,
    targetInputElement,
  ) => {
    console.log("[CoPrompt Debug] handleEnhanceClick: Entered", {
      buttonElement,
      reqId,
      targetInputElement,
    }); // DEBUG

    // Disable button and show loading state
    if (buttonElement) {
      buttonElement.disabled = true;
      buttonElement.style.cursor = "wait"; // Or rely on .coprompt-loading class from CSS
      buttonElement.classList.add("coprompt-loading");
    }

    // Extract the prompt text from the active input field
    // Use textContent for divs, value for inputs/textareas
    const promptText = targetInputElement
      ? targetInputElement.value !== undefined
        ? targetInputElement.value
        : targetInputElement.textContent
      : "";

    console.log(
      "[CoPrompt Debug] handleEnhanceClick: Prompt text:",
      promptText,
    ); // DEBUG

    if (!promptText || !promptText.trim()) {
      // Check for null/undefined as well
      console.error("CoPrompt: Prompt text is empty or invalid.");
      if (buttonElement) {
        // Reset button if prompt is empty
        resetButtonState(buttonElement);
      }
      return;
    }
    if (!reqId) {
      console.error("CoPrompt: Button is missing request ID.");
      // Optionally provide user feedback here
      return;
    }

    // Set loading content (dots + text from ENHANCING_LABEL)
    if (buttonElement) {
      buttonElement.innerHTML = `
        <div class="coprompt-loading-dots-container">
          <div class="coprompt-loading-dot"></div>
          <div class="coprompt-loading-dot"></div>
          <div class="coprompt-loading-dot"></div>
        </div>
        <span>${ENHANCING_LABEL}</span> 
      `; // Using ENHANCING_LABEL constant
    }

    try {
      // 1. Get Conversation Context (Restored generic call)
      let conversationContext = [];
      // Assuming getConversationContext() is defined elsewhere and handles site-specifics or is generic.
      // The CodeQL errors were about hostname checks. If those checks were originally part of how
      // getConversationContext was called, or if different context functions were called based on hostname,
      // that specific branching logic would need to be restored here, using isAllowedHostname.
      // For now, this restores the simple call as indicated by the diff.
      conversationContext = getConversationContext();
      console.log(
        "[CoPrompt Debug] handleEnhanceClick: Context captured:",
        JSON.stringify(conversationContext),
      ); // DEBUG

      // 2. Send message to background script
      console.log(
        "[CoPrompt Debug] handleEnhanceClick: About to send message to background script",
        {
          type: "ENHANCE_PROMPT_REQUEST",
          reqId,
          promptText,
          context: conversationContext,
          targetInputId: targetInputElement?.id,
        },
      ); // DEBUG
      chrome.runtime.sendMessage(
        {
          type: "ENHANCE_PROMPT_REQUEST", // Action type
          prompt: promptText, // User's input
          context: conversationContext, // Separately gathered context
          requestId: reqId,
          targetInputId: targetInputElement?.id,
        },
        // NO second argument like "*" here for background script messages
        (response) => {
          // Add response handler callback
          console.log(
            "[CoPrompt Debug] handleEnhanceClick: Received response from background script:",
            response,
          );
          if (chrome.runtime.lastError) {
            console.error(
              "CoPrompt: Error sending message to background script or receiving response:",
              chrome.runtime.lastError.message,
            );
            if (buttonElement) {
              resetButtonState(buttonElement);
              // Optionally update button title or UI to show error
              buttonElement.title =
                "Error communicating with background script.";
            }
            return;
          }

          if (response && response.type === "ENHANCE_PROMPT_RESPONSE") {
            if (response.enhancedPrompt && targetInputElement) {
              updateInputElement(targetInputElement, response.enhancedPrompt);
            } else if (response.error) {
              console.error("CoPrompt: Enhancement failed:", response.error);
              // Optionally update UI to show this error
              if (targetInputElement) {
                // Or show in a notification
                updateInputElement(
                  targetInputElement,
                  `Error: ${response.error}`,
                );
              }
            }
          } else if (response && response.type === "ERROR_RESPONSE") {
            console.error(
              "CoPrompt: Background script returned an error:",
              response.error,
            );
            // Optionally update UI
            if (targetInputElement) {
              // Or show in a notification
              updateInputElement(
                targetInputElement,
                `Error: ${response.error}`,
              );
            }
          } else {
            console.warn(
              "[CoPrompt Debug] handleEnhanceClick: Received unexpected response structure from background:",
              response,
            );
          }

          if (buttonElement) {
            resetButtonState(buttonElement);
          }
        },
      );
      // The console.log below was for the window.postMessage, which we are moving away from for this direct bg communication.
      // console.log("[CoPrompt Debug] handleEnhanceClick: CoPromptExecuteEnhance message sent."); // DEBUG
    } catch (error) {
      console.error("CoPrompt: Error in handleEnhanceClick:", error);
      // Reset button state on error
      if (buttonElement) {
        // Check if buttonElement still exists
        // Ensure resetButtonState is defined and handles this scenario
        // For example, it should re-enable the button, remove loading class, restore original text/icon.
        resetButtonState(buttonElement);
      }
      // Optionally, provide more specific user feedback to the user via the UI
      if (buttonElement) {
        buttonElement.title = "Error during enhancement. Please try again.";
        buttonElement.classList.add("coprompt-error"); // Add an error class for styling
      }
    }
  };

  // Attach drag handler AND pass the new click handler
  // Update the callback signature to match handleEnhanceClick
  makeDraggable(
    buttonContainer,
    (btnElement, rId, targetInput) =>
      handleEnhanceClick(btnElement, rId, targetInput),
    enhanceButton,
  );

  buttonInjected = true;
  debugLog("Floating button injected.");

  // Force the button to be visible after a short delay
  setTimeout(() => {
    const button = document.getElementById("coprompt-button");
    const container = document.getElementById("coprompt-container");

    if (button && container) {
      // Ensure classes are present if needed (though IDs should suffice)
      debugLog("Button exists, CSS should handle visibility.");
    } else {
      debugLog("Button not found after delay, recreating");
      buttonInjected = false;
      createFloatingButton();
    }
  }, 500);
}

// --- Utility Functions Specific to Interaction Logic Moved from interactionHandler ---
// Re-add simple debugLog function (or use DEBUG directly)
// Ensure these are available for the handler
const logInteractionHandlerDebug = (...args) =>
  DEBUG && console.log("[CoPrompt IH Debug]", ...args);
const logInteractionHandlerError = (...args) =>
  console.error("[CoPrompt IH Error]", ...args);

// --- Platform-Specific Context Extraction ---
// TODO: Move this to content/contextExtractor.js as per refactoring plan
// TODO: Add platform detection (e.g., check window.location.hostname)
export function getConversationContext() {
  // Moved to top level and Exported
  debugLog("Attempting to get conversation context...");
  const messages = [];
  const hostname = window.location.hostname;

  try {
    if (isAllowedHostname(hostname, ["openai.com", "chatgpt.com"])) {
      debugLog("Extracting context for ChatGPT/OpenAI");
      const messageElements = document.querySelectorAll(
        "[data-message-author-role]",
      );
      messageElements.forEach((el) => {
        const role = el.getAttribute("data-message-author-role");
        // Find the actual content within the message structure
        // This selector might need adjustment based on actual ChatGPT structure
        const contentEl = el.querySelector(".markdown"); // Adjust selector as needed
        const content = contentEl ? contentEl.textContent.trim() : "";
        if (role && content) {
          messages.push({ role: role, content: content });
        }
      });
    } else if (isAllowedHostname(hostname, ["claude.ai"])) {
      debugLog("Extracting context for Claude");
      const messageElements = document.querySelectorAll(
        '[data-testid="user-message"], .font-claude-message',
      );
      messageElements.forEach((el) => {
        let role = "";
        let content = el.textContent.trim();
        if (el.matches('[data-testid="user-message"]')) {
          role = "user";
        } else if (el.classList.contains("font-claude-message")) {
          // Or a more specific selector for Claude assistant messages
          role = "assistant";
        }
        if (role && content) {
          messages.push({ role: role, content: content });
        }
      });
    } else if (isAllowedHostname(hostname, ["gemini.google.com"])) {
      debugLog("Extracting context for Gemini");
      // Use the more specific custom element tags identified
      const messageElements = document.querySelectorAll(
        "user-query-content, model-response",
      );

      messageElements.forEach((el) => {
        let role = "";
        let content = "";

        // Check if it's a user message container
        if (el.classList.contains("user-query")) {
          role = "user";
          // Find the actual text content within the user query structure
          const queryTextEl = el.querySelector(".query-text"); // Example selector
          content = queryTextEl
            ? queryTextEl.textContent.trim()
            : el.textContent.trim();
        }
        // Check if it's an assistant message container
        else if (el.classList.contains("model-response-text")) {
          role = "assistant";
          // Content is often directly within this element, or nested
          content = el.textContent.trim();
          // Remove potential artifacts like "edit" buttons if necessary
          // content = content.replace(/\s*edit$/i, '').trim();
        }

        if (role && content) {
          messages.push({ role: role, content: content });
        }
      });
    }
    // Add other platforms here...

    debugLog(
      `Extracted ${messages.length} messages from context for ${hostname}.`,
    );
    // Limit to last 6 messages if necessary
    return messages.slice(-6);
  } catch (error) {
    console.error("Error extracting conversation context:", error);
    return []; // Return empty array on error
  }
}

// --- NEW: Button Reset Logic (Moved from injected.js) ---
function resetButtonState(button) {
  // Use content script's debug flags/loggers if needed
  // const logResetDebug = (...args) => DEBUG && console.log('[RESET_BUTTON_DEBUG_CS]', ...args);
  // const logWarnDebug = (...args) => console.warn('[RESET_BUTTON_WARN_CS]', ...args);
  // const logResetError = (...args) => console.error('[RESET_BUTTON_ERROR_CS]', ...args);
  // logResetDebug(`resetButtonState called for button:`, button);

  if (button && button.tagName === "BUTTON") {
    try {
      // logResetDebug("Valid button passed. Attempting reset...");
      button.disabled = false;
      button.style.cursor = "pointer";
      button.classList.remove("coprompt-loading");
      // Restore original background color if needed, or rely on CSS

      // Reconstruct content safely (assuming structure defined in createFloatingButton)
      button.textContent = "";
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
      svg.classList.add("lucide", "lucide-sparkles");
      svg.innerHTML = `
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
          <path d="M20 3v4"></path>
          <path d="M22 5h-4"></path>
          <path d="M4 17v2"></path>
          <path d="M5 18H3"></path>
        `;
      const textNode = document.createTextNode(" Improve Prompt");
      button.appendChild(svg);
      button.appendChild(textNode);
      // logResetDebug(`Button reset complete: Disabled=false, Content set programmatically.`);
    } catch (error) {
      logInteractionHandlerError(
        `[Content Script] Error resetting button state: ${error.message}`,
        error,
      );
      // Fallback: Just set text
      button.textContent = "Improve Prompt";
      button.disabled = false;
      button.style.cursor = "pointer";
      button.classList.remove("coprompt-loading");
    }
  } else {
    logInteractionHandlerError(
      "[Content Script] Reset skipped: Invalid or null button passed.",
      button,
    );
  }
}

// --- Register the message handler Statically ---
// Remove the dynamic import IIFE

// This listener handles messages FROM injected script AND background script responses
if (typeof handleWindowMessage === "function") {
  // Listener for postMessage FROM injected script (e.g., CoPromptEnhanceRequest)
  window.addEventListener("message", handleWindowMessage);
  console.log("CoPrompt: Window message handler registered successfully.");

  // Listener for messages/responses FROM background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logInteractionHandlerDebug(
      "[Content Script] Received message from background:",
      message,
    );
    // Destructure all expected properties, including targetInputId and new requestId
    const { type, requestId, enhancedPrompt, error, targetInputId } = message;

    // Find the button associated with this request early USING THE RECEIVED requestId
    const buttonElement = requestId
      ? document.querySelector(
          `button[data-co-prompt-request-id="${requestId}"]`,
        )
      : null;

    if (!buttonElement && requestId) {
      // Only log error if requestId was present but button not found
      logInteractionHandlerError(
        `[Content Script] Button with ID ${requestId} not found to handle response.`,
      );
      // Cannot reset button or easily show error in context
      // if (error) alert(`Enhancement failed: ${error}`); // Avoid alert if button not found, might be confusing
      return false;
    }
    // If requestId itself is missing, something else is wrong, but we can't find the button.
    if (!requestId) {
      logInteractionHandlerError(
        `[Content Script] Received response from background without a requestId. Cannot update button state. Message:`,
        message,
      );
      // If error exists in message, maybe alert it as a last resort, but button state can't be fixed.
      if (error) alert(`Enhancement error (no button context): ${error}`);
      return false;
    }

    // Use the correct message types
    if (type === "ENHANCE_PROMPT_RESPONSE") {
      logInteractionHandlerDebug(
        "[Content Script] Handling ENHANCE_PROMPT_RESPONSE from background.",
      );
      // Use the targetInputId from the message to find the input element
      const inputElement = targetInputId
        ? document.getElementById(targetInputId)
        : findActiveInputElement();

      if (inputElement && enhancedPrompt) {
        updateInputElement(inputElement, enhancedPrompt);
      } else {
        logInteractionHandlerError(
          "[Content Script] Could not find input element using ID: ",
          targetInputId,
          " or enhancedPrompt empty.",
        );
        if (error)
          alert(`Enhancement failed: ${error}`); // Show error if present in response
        else if (!inputElement)
          alert("Failed to find the text field to update.");
      }
      if (buttonElement) resetButtonState(buttonElement);
      return false;
    } else if (type === "ENHANCE_PROMPT_ERROR") {
      // Use the correct error type
      logInteractionHandlerError(
        "[Content Script] Handling ENHANCE_PROMPT_ERROR from background:",
        error,
      );
      alert(`Enhancement failed: ${error || "Unknown error"}`);
      if (buttonElement) resetButtonState(buttonElement);
      return false;
    }

    // Handle other message types if necessary
    logInteractionHandlerDebug(
      "[Content Script] Message type not handled by primary handlers:",
      type,
    );
    return false; // Default to no async response
  });
  console.log("CoPrompt: Background message listener registered successfully.");
} else {
  console.error(
    "CoPrompt: Failed to register message handler (handleWindowMessage not found).",
  );
}

// --- Initial Setup ---
console.log("CoPrompt: content.js loaded.");
