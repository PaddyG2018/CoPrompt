// Handles messages received via window.postMessage

// Helper to dynamically import and use debugLog if needed
async function logDebug(message, ...args) {
  try {
    const { debugLog } = await import(chrome.runtime.getURL('utils/logger.js'));
    debugLog(message, ...args);
  } catch (e) { /* console.log("[MessageHandler DEBUG]", message, ...args); */ }
}

// --- Internal Helpers ---

// Handles request from injected script to get API key
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _handleApiKeyRequest(_event) {
  logDebug("Handling API key request from injected script");
  chrome.runtime.sendMessage({ type: "GET_API_KEY" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting API key:", chrome.runtime.lastError);
      window.postMessage({ type: "CoPromptAPIKeyResponse", key: null, error: chrome.runtime.lastError.message }, "*");
      return;
    }
    if (response?.key) {
      logDebug("Got API key, sending response to injected script");
      window.postMessage({ type: "CoPromptAPIKeyResponse", key: response.key }, "*");
    } else {
      console.error("API key retrieval failed in background script");
      window.postMessage({ type: "CoPromptAPIKeyResponse", key: null, error: "Failed to retrieve API key from background." }, "*");
    }
  });
}

// Handles request from injected script to enhance prompt
async function _handleEnhanceRequest(event) {
  logDebug("Handling EnhanceRequest from injected script:", event.data);

  // Dynamically import context extractor
  let conversationContext = [];
  try {
    const contextExtractorModule = await import(chrome.runtime.getURL('content/contextExtractor.js'));
    conversationContext = contextExtractorModule.getConversationContext();
    logDebug("Captured Context (from module):", JSON.stringify(conversationContext, null, 2));
  } catch (error) {
    console.error("Failed to load or run context extractor module:", error);
  }

  const requestStartTime = Date.now();
  logDebug("Sending request to background script at", new Date().toISOString());

  // Setup timeout for background response (slightly shorter than injected script's timeout)
  let timeoutId = setTimeout(() => {
    console.error("MessageHandler: Background script response timed out after 55 seconds");
    window.postMessage({ type: "CoPromptEnhanceResponse", error: "Background script response timed out (55s)." }, "*");
    timeoutId = null; // Prevent trying to clear later
  }, 55000);

  try {
    chrome.runtime.sendMessage(
      {
        type: "ENHANCE_PROMPT",
        prompt: event.data.prompt,
        systemInstruction: event.data.systemInstruction,
        conversationContext: conversationContext,
      },
      (response) => {
        // --- Background Script Response Callback --- 
        if (!timeoutId) { // Check if timeout already occurred
          logDebug("Timeout already occurred, ignoring response from background.");
          return;
        }
        clearTimeout(timeoutId);
        timeoutId = null;

        if (chrome.runtime.lastError) {
          console.error("MessageHandler: chrome.runtime.sendMessage callback error:", chrome.runtime.lastError.message);
          let errorMessage = "An error occurred communicating with the background service.";
          if (chrome.runtime.lastError.message?.includes("Extension context invalidated")) {
              errorMessage = "Connection to background service lost. Please try again.";
          }
          // Send error back to injected script
          window.postMessage({ type: "CoPromptEnhanceResponse", error: errorMessage }, "*");
          return;
        }

        const requestTime = (Date.now() - requestStartTime) / 1000;
        logDebug(`Received response from background script after ${requestTime.toFixed(2)} seconds:`, response);

        if (!response) {
          console.error("MessageHandler: No response received from background script");
          window.postMessage({ type: "CoPromptEnhanceResponse", error: "Empty response received from background script." }, "*");
          return;
        }

        // Forward background response (or error) to injected script
        if (response.error) {
           window.postMessage({ type: "CoPromptEnhanceResponse", error: response.error }, "*");
        } else if (response.enhancedPrompt) {
           window.postMessage({ type: "CoPromptEnhanceResponse", enhancedPrompt: response.enhancedPrompt }, "*");
        } else {
           console.error("MessageHandler: Invalid response format from background script", response);
           window.postMessage({ type: "CoPromptEnhanceResponse", error: "Invalid response format from background." }, "*");
        }
      }
    );
  } catch (error) {
    // Catch synchronous errors (e.g., context invalidated immediately)
    console.error("MessageHandler: chrome.runtime.sendMessage synchronous error:", error);
    if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }
    let errorMessage = "Failed to send request to background service.";
    if (error.message?.includes("Extension context invalidated")) {
        errorMessage = "Connection to background service failed. Please try again.";
    }
    // Send error back to injected script
    window.postMessage({ type: "CoPromptEnhanceResponse", error: errorMessage }, "*");
  }
}

// Handles response *intended for the DOM/user* which originates from injected script
// (e.g., after background script replies to injected script)
async function _handleDomUpdateResponse(event) {
    logDebug("Handling DOM update response originating from injected script:", event.data);
    
    // Restore button state visually
    const button = document.querySelector("#coprompt-button");
    if (button) {
      button.classList.remove("coprompt-loading");
      button.disabled = false;
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
            <path d="M20 3v4"></path><path d="M22 5h-4"></path><path d="M4 17v2"></path><path d="M5 18H3"></path>
        </svg>Improve Prompt`;
    }

    // Dynamically import DOM utils
    const { findActiveInputElement, updateInputElement } = await import(chrome.runtime.getURL('utils/domUtils.js'));

    const improvedPrompt = event.data.enhancedPrompt;
    if (!improvedPrompt) {
      logDebug("No improved prompt in DOM update response");
      // Optionally handle cases where only an error was passed, though errors are typically handled by injected script now
      if (event.data.error) {
          console.error("Error received in DOM update response:", event.data.error);
          // Maybe show an alert here? Depends on desired flow.
      }
      return;
    }

    logDebug("Finding input field to update...");
    const inputField = findActiveInputElement();
    logDebug("Input field found:", inputField);

    // Update the input field (handles null field with fallback alert internally)
    updateInputElement(inputField, improvedPrompt);
}


/**
 * Main handler for window.postMessage events, delegating to specific handlers.
 * @param {MessageEvent} event The message event.
 */
export async function handleWindowMessage(event) {
  if (event.source !== window || !event.data?.type) return;
  logDebug("[MessageHandler] Received message:", event.data.type);

  switch (event.data.type) {
    case "CoPromptGetAPIKey": // Request from injected script
      _handleApiKeyRequest(event);
      break;
    case "CoPromptEnhanceRequest": // Request from injected script
      await _handleEnhanceRequest(event);
      break;
    case "CoPromptEnhanceResponse": // Response originally from background, passed via injected, now for DOM update
      await _handleDomUpdateResponse(event);
      break;
    // Add other message type handlers here if needed
    default:
      logDebug("[MessageHandler] Unhandled message type:", event.data.type);
      break;
  }
} 