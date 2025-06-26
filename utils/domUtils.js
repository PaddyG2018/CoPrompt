// DOM Utility functions for CoPrompt

/**
 * Finds the currently active/targetable input element (textarea or contenteditable)
 * on known chat platforms.
 * Uses multiple strategies to increase robustness.
 * @returns {HTMLElement | null} The found input element or null.
 */
export function findActiveInputElement() {
  let inputField = null;
  const debugLog = (message, ...args) => {
    // Basic logging for now, replace with proper logger if needed
    // console.log(`[findActiveInputElement] ${message}`, ...args); // Quieted for now
  };

  // Strategy 1: Direct ID selector for contenteditable (ChatGPT)
  inputField = document.querySelector(
    "div#prompt-textarea[contenteditable='true']",
  );
  if (inputField) {
    // debugLog("Found via #prompt-textarea[contenteditable]"); // Quieted
    return inputField;
  }

  // Strategy 2: Direct ID selector for textarea (Legacy ChatGPT, others?)
  // REMOVED - This selector is likely outdated based on recent inspection
  // if (!inputField) {
  //   inputField = document.querySelector("textarea#prompt-textarea");
  //   if (inputField) {
  //     // debugLog("Found via textarea#prompt-textarea"); // Quieted
  //     return inputField;
  //   }
  // }

  // Strategy 3: Look for ProseMirror contenteditable (Claude)
  if (!inputField) {
    inputField = document.querySelector(
      "div.ProseMirror[contenteditable='true']",
    );
    if (inputField) {
      // debugLog("Found via div.ProseMirror[contenteditable]"); // Quieted
      return inputField;
    }
  }

  // Strategy 3.5: Look for Gemini contenteditable
  if (!inputField) {
    inputField = document.querySelector(
      "div.ql-editor[contenteditable='true']",
    );
    if (inputField) {
      // debugLog("Found via div.ql-editor[contenteditable]"); // Quieted
      return inputField;
    }
  }

  // Strategy 3.6: Look for Lovable.dev input elements
  if (!inputField) {
    // Lovable.dev may use various input patterns for their AI chat interface
    const lovableSelectors = [
      "textarea[placeholder*='ask'], textarea[placeholder*='prompt'], textarea[placeholder*='chat']", // Common placeholders
      "div[contenteditable='true'][placeholder*='ask'], div[contenteditable='true'][placeholder*='prompt']",
      ".chat-input textarea, .prompt-input textarea, .message-input textarea", // Common class patterns
      ".chat-input div[contenteditable='true'], .prompt-input div[contenteditable='true']",
      "[data-testid*='chat-input'], [data-testid*='prompt-input'], [data-testid*='message-input']", // Test ID patterns
      ".input-container textarea, .input-container div[contenteditable='true']", // Container patterns
      "form textarea:last-of-type, form div[contenteditable='true']:last-of-type" // Form-based patterns
    ];
    
    for (const selector of lovableSelectors) {
      inputField = document.querySelector(selector);
      if (inputField && inputField.offsetParent !== null) {
        // debugLog("Found via Lovable selector:", selector); // Quieted
        return inputField;
      }
    }
  }

  // Strategy 4: Any visible textarea (General fallback, might catch Claude/others if Strategy 3 fails)
  if (!inputField) {
    const textareas = document.querySelectorAll("textarea");
    for (const textarea of textareas) {
      // Check if visible (offsetParent is a simple check)
      if (textarea.offsetParent !== null) {
        inputField = textarea;
        // debugLog("Found via visible textarea", textarea); // Quieted
        return inputField;
      }
    }
  }

  // Strategy 5: Any visible contenteditable div (General fallback)
  if (!inputField) {
    const contenteditables = document.querySelectorAll(
      "div[contenteditable='true']",
    );
    for (const div of contenteditables) {
      // Check if visible
      if (div.offsetParent !== null) {
        inputField = div;
        // debugLog("Found via visible contenteditable div", div); // Quieted
        return inputField;
      }
    }
  }

  // Strategy 6: Look for the main form and find the input within it
  if (!inputField) {
    // Common form selectors across platforms
    const form = document
      .querySelector(
        "form, form > textarea, form > div[contenteditable='true']",
      )
      ?.closest("form");
    if (form) {
      // debugLog("Found form, searching within", form); // Quieted
      // Search within the form for the most likely input field
      const formInput = form.querySelector(
        "textarea, div[contenteditable='true']",
      );
      if (formInput && formInput.offsetParent !== null) {
        inputField = formInput;
        // debugLog("Found input within form", formInput); // Quieted
        return inputField;
      }
    }
  }

  // debugLog("Could not find active input element after all strategies."); // Quieted
  return null; // Return null if no suitable element is found
}

/**
 * Helper function to show a simple alert when input update fails.
 * @param {string} alertReason A prefix for the alert message.
 */
function simpleFallback(alertReason) {
  console.warn(`[domUtils] Triggering fallback: ${alertReason}`); // Log the reason
  alert(`${alertReason} Please try enhancing your prompt again.`);
}

/**
 * Updates the value/content of a target input element (textarea or contenteditable).
 * Handles different element types and dispatches necessary events.
 * Includes fallback alert if update fails.
 * @param {HTMLElement | null} element The input element to update, or null to trigger fallback.
 * @param {string} text The text to insert.
 */
export function updateInputElement(element, text) {
  // console.log("[domUtils] Entered updateInputElement. Element:", element); // Quieted for now
  const debugLog = (message, ...args) => {
    // console.log(`[updateInputElement] ${message}`, ...args); // Quieted for now
  };
  const errorLog = (message, ...args) => {
    console.error(`[updateInputElement] ${message}`, ...args);
  };

  if (!element) {
    errorLog("Target element not provided, falling back.");
    simpleFallback("Could not find the input field."); // Use simple fallback
    return; // Stop execution
  }

  try {
    // For contenteditable divs
    if (element.getAttribute("contenteditable") === "true") {
      debugLog("Updating contenteditable element:", element);
      try {
        // Best approach: Simulate user input event if possible
        element.focus();
        // Select all existing content might not always be desired, but often is for replacement
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, text);
        debugLog("Successfully updated contenteditable via execCommand");
      } catch (error1) {
        errorLog(
          "Error updating contenteditable with execCommand, trying innerText fallback:",
          error1,
        );
        try {
          // Fallback: Set innerText directly
          element.innerText = text;
          // Trigger input event manually as innerText doesn't always do it
          const inputEvent = new Event("input", {
            bubbles: true,
            cancelable: true,
          });
          element.dispatchEvent(inputEvent);
          debugLog(
            "Successfully updated contenteditable via innerText and dispatched event",
          );
        } catch (error2) {
          errorLog(
            "Error updating contenteditable with innerText fallback:",
            error2,
          );
          throw error2; // Re-throw error to trigger outer catch block and fallback
        }
      }
    }
    // For regular textareas
    else if (element.tagName === "TEXTAREA") {
      debugLog("Updating textarea element:", element);
      element.value = text;
      // Dispatch events to ensure frameworks/listeners detect the change
      element.dispatchEvent(
        new Event("input", { bubbles: true, cancelable: true }),
      );
      element.dispatchEvent(
        new Event("change", { bubbles: true, cancelable: true }),
      );
      element.focus(); // Set focus back to the textarea
      debugLog("Successfully updated textarea and dispatched events");
    } else {
      errorLog("Unknown input field type:", element.tagName, element);
      // Attempt generic update if possible, might not work
      try {
        element.value = text;
        element.dispatchEvent(
          new Event("input", { bubbles: true, cancelable: true }),
        );
        element.dispatchEvent(
          new Event("change", { bubbles: true, cancelable: true }),
        );
      } catch (genericError) {
        throw new Error("Unsupported element type for update.");
      }
    }
  } catch (error) {
    // Catch errors during the update process
    errorLog("Failed to update input field directly, falling back:", error);
    simpleFallback("Could not update the input field directly."); // Use simple fallback
  }
}
