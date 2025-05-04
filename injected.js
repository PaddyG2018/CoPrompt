import {
  DEFAULT_SYSTEM_INSTRUCTION,
  CODE_SYSTEM_INSTRUCTION,
  RESEARCH_SYSTEM_INSTRUCTION,
  CREATIVE_SYSTEM_INSTRUCTION,
} from "./utils/constants.js";

// Simple flag - injected scripts don't have easy access to manifest
// Assume production logging unless specifically enabled for debug builds
const DEBUG = false;

if (DEBUG) console.log("CoPrompt injected.js loaded successfully");

// Modified to use message passing instead of direct API calls
async function determinePromptCategory(prompt) {
  // Simple regex patterns for initial categorization
  const codePatterns =
    /\bcode\b|\bfunction\b|\bclass\b|\bprogramming\b|\bjavascript\b|\bpython\b|\bc\+\+\b|\bjava\b|\bhtml\b|\bcss\b|\bsql\b/i;
  const researchPatterns =
    /\bresearch\b|\bstudy\b|\banalysis\b|\bdata\b|\bscientific\b|\bhistory\b|\bexplain\b|\btheory\b/i;
  const creativePatterns =
    /\bstory\b|\bcreative\b|\bwrite\b|\bpoem\b|\bnarrative\b|\bfiction\b|\bimagine\b|\bscenario\b/i;

  // Try regex first for efficiency
  if (codePatterns.test(prompt)) return "code";
  if (researchPatterns.test(prompt)) return "research";
  if (creativePatterns.test(prompt)) return "creative";

  // No AI fallback - just use general category to avoid CSP issues
  return "general";
}

// ✅ Improved API key retrieval with timeout
async function getAPIKeyFromContentScript() {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.error("API key request timed out");
      resolve(null);
    }, 5000);

    const handleMessage = (event) => {
      if (
        event.source !== window ||
        event.data.type !== "CoPromptAPIKeyResponse"
      )
        return;

      // Clean up
      clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);

      if (event.data.key) {
        resolve(event.data.key);
      } else {
        console.error("No API key received from content script.");
        resolve(null);
      }
    };

    window.addEventListener("message", handleMessage);
    window.postMessage({ type: "CoPromptGetAPIKey" }, "*");
  });
}

// Modified to use message passing for API calls
window.enhancePrompt = async function (prompt) {
  if (DEBUG) console.log("Sending prompt to AI for enhancement:", prompt);

  try {
    // Get API key through content.js
    const apiKey = await getAPIKeyFromContentScript();
    if (!apiKey) {
      console.error("No API key found.");
      return prompt; // Fallback to original prompt
    }

    // Detect category using regex only (no API call)
    const category = await determinePromptCategory(prompt);
    if (DEBUG) console.log("Detected category:", category);

    // Define tailored instructions based on category
    let systemInstruction = DEFAULT_SYSTEM_INSTRUCTION;

    if (category === "code") {
      systemInstruction = CODE_SYSTEM_INSTRUCTION;
    } else if (category === "research") {
      systemInstruction = RESEARCH_SYSTEM_INSTRUCTION;
    } else if (category === "creative") {
      systemInstruction = CREATIVE_SYSTEM_INSTRUCTION;
    }

    // Send request to background script via content script
    return new Promise((resolve) => {
      // Increase timeout to 60 seconds (from 30)
      const timeoutId = setTimeout(() => {
        console.error("Enhance prompt request timed out after 60 seconds");
        window.removeEventListener("message", handleEnhanceResponse);
        resolve(prompt); // Return original prompt on timeout
      }, 60000);

      // Track when the request was sent
      const requestStartTime = Date.now();
      if (DEBUG)
        console.log(
          "Sending enhancement request at:",
          new Date().toISOString(),
        );

      const handleEnhanceResponse = (event) => {
        if (
          event.source !== window ||
          event.data.type !== "CoPromptEnhanceResponse"
        )
          return;

        // Calculate response time
        const responseTime = (Date.now() - requestStartTime) / 1000;
        if (DEBUG)
          console.log(
            `Received enhancement response after ${responseTime.toFixed(2)} seconds`,
          );

        // Clean up
        clearTimeout(timeoutId);
        window.removeEventListener("message", handleEnhanceResponse);

        if (event.data.error) {
          console.error("Error enhancing prompt:", event.data.error);
          resolve(prompt); // Return original on error
        } else {
          if (DEBUG)
            console.log("AI-enhanced prompt received from background script");

          // Verify we got a meaningful enhancement
          const enhancedPrompt = event.data.enhancedPrompt || prompt;

          // If the enhanced prompt is the same as the original or very short, return the original
          if (
            enhancedPrompt === prompt ||
            enhancedPrompt.length < prompt.length
          ) {
            console.warn(
              "Enhanced prompt was not meaningful, returning original",
            );
            resolve(prompt);
          } else {
            resolve(enhancedPrompt);
          }
        }
      };

      window.addEventListener("message", handleEnhanceResponse);

      // Send request to content script
      window.postMessage(
        {
          type: "CoPromptEnhanceRequest",
          prompt: prompt,
          systemInstruction: systemInstruction,
        },
        "*",
      );
    });
  } catch (error) {
    console.error("Error in enhancePrompt:", error);
    return prompt; // Fallback: return original prompt if anything fails
  }
};

// Function to update the input field (Handles different input types)
function updateInputElement(element, text) {
  logInjectedDebug(`Attempting to update element with text (length: ${text.length})`);
  if (!element) {
    logInjectedDebug("Update failed: Element is null.");
    return;
  }

  try {
    // Check if the element is a standard input or textarea
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = text;
      // Dispatch input event to trigger any framework listeners (React, Vue, etc.)
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      logInjectedDebug("Updated value of INPUT/TEXTAREA and dispatched input event.");
    }
    // Check if the element is contenteditable
    else if (element.isContentEditable) {
       logInjectedDebug("Element is contenteditable. Attempting update with execCommand...");
       // Focus the element first
       element.focus();
       // Use execCommand to insert text - this often works better with framework-controlled inputs
       const success = document.execCommand('insertText', false, text);
       if (success) {
         logInjectedDebug("execCommand('insertText') succeeded.");
       } else {
         // Report foundational error (Story 1.2) - before fallback
         const errorMsg = "execCommand('insertText') returned false.";
         console.error("[CoPrompt Injected Error] E_UPDATE_INPUT_FAILED:", errorMsg);
         window.postMessage({ type: "CoPromptReportError", detail: { code: 'E_UPDATE_INPUT_FAILED', message: errorMsg, context: 'execCommand returned false' } }, "*");
         // Fallback to textContent if execCommand fails (less likely to work, but safe)
         element.textContent = text;
         element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
         logInjectedDebug("Updated textContent as fallback and dispatched input event.");
       }
    } else {
      logInjectedDebug("Update failed: Element is not an input, textarea, or contenteditable.", element);
    }
  } catch (error) {
    // Report foundational error (Story 1.2)
    console.error("[CoPrompt Injected Error] E_UPDATE_INPUT_FAILED: Error occurred during updateInputElement:", error);
    window.postMessage({ type: "CoPromptReportError", detail: { code: 'E_UPDATE_INPUT_FAILED', message: error.message, stack: error.stack } }, "*");
    logInjectedDebug("Error occurred during updateInputElement:", error.message);
  }
}

// Function to create and add the enhance button
function addEnhanceButton(inputElement) {
  // ... (Existing addEnhanceButton logic - should be stable from reset state) ...
}

// Function to reset the button state - Simplified for Functional Reset
function resetButtonState() {
  logInjectedDebug("Attempting functional button reset.");

  // Clear timeout if it exists
  if (requestTimeoutId) {
    clearTimeout(requestTimeoutId);
    requestTimeoutId = null;
    logInjectedDebug("Cleared response timeout during reset.");
  }

  // Use the enhanceButton state variable which should hold the reference
  if (enhanceButton) {
     try {
        // Prioritize making the button functionally clickable again
        enhanceButton.disabled = false;
        // Attempt to reset visual state (may be overridden by host page)
        enhanceButton.textContent = ORIGINAL_LABEL;
        enhanceButton.style.cursor = 'pointer';
        enhanceButton.style.backgroundColor = "#6a0dad"; // Reset color

        logInjectedDebug(`Functional button reset executed: Disabled=${enhanceButton.disabled}, Text='${enhanceButton.textContent}'`);
     } catch (error) {
         // Report foundational error (Story 1.2)
         console.error("[CoPrompt Injected Error] E_BUTTON_RESET_FAILED: Error resetting button state:", error);
         window.postMessage({ type: "CoPromptReportError", detail: { code: 'E_BUTTON_RESET_FAILED', message: error.message, stack: error.stack } }, "*");
         logInjectedDebug("Error during resetButtonState:", error.message);
         enhanceButton = null; 
     }
  } else {
    logInjectedDebug("Reset skipped: Button element variable (enhanceButton) is null.");
  }
}

// --- Communication with Content Script ---
window.addEventListener('message', (event) => {
  // ... (validation & logging) ...
  if (event.source !== window || !event.data || !event.data.type) return;
  // ... (log relevant messages)

  if (event.data.type === "CoPromptEnhanceResponse") {
    logInjectedDebug("Processing CoPromptEnhanceResponse...");
    // Reset button state after processing response (success or error)
    resetButtonState(); // Call the simplified reset function

    if (event.data.error) {
      console.error("[CoPrompt Injected] Enhancement failed:", event.data.error);
      // Basic alert for now (per Phase 1.3)
      alert(`Enhancement Error: ${event.data.error}`); 
    } else if (event.data.enhancedPrompt) {
      logInjectedDebug("Enhancement successful. Finding input element to update...");
      const inputElement = currentInputElement || findActiveInputElement(); 
      if (inputElement) {
        logInjectedDebug("Input element found. Updating content...");
        updateInputElement(inputElement, event.data.enhancedPrompt);
        logInjectedDebug("Input element update attempted.");
      } else {
        console.error("[CoPrompt Injected] Could not find input element to update after enhancement.");
        alert("Error: Could not find the text input field to place the enhanced prompt.");
      }
    } else {
        logInjectedDebug("Received CoPromptEnhanceResponse but no error or prompt data found.", event.data);
        // Handle unexpected response format if necessary
    }
  }
});

// ... (Initialization, MutationObserver) ...

function findActiveInputElement() {
  logInjectedDebug("Attempting to find active input element...");
  const element = /* ... selectors ... */ document.querySelector('div[contenteditable="true"]');
  // ... (visibility check) ...
  if (!element) {
     // Report foundational error (Story 1.2)
     console.error("[CoPrompt Injected Error] E_NO_INPUT_FIELD: No suitable active input element found.");
     window.postMessage({ type: "CoPromptReportError", detail: { code: 'E_NO_INPUT_FIELD', message: 'No suitable active input element found.' } }, "*");
  }
  logInjectedDebug(element ? "Found active input element:" : "No suitable active input element found.", element);
  return element;
}
