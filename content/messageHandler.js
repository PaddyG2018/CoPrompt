// Handles messages received via window.postMessage

// Helper to dynamically import and use debugLog if needed
async function logDebug(message, ...args) {
  try {
    const { debugLog } = await import(chrome.runtime.getURL("utils/logger.js"));
    debugLog(message, ...args);
  } catch (e) {
    /* console.log("[MessageHandler DEBUG]", message, ...args); */
  }
}

// Flag for enabling debug logs specifically in this module
// Set this to true manually for local debugging, should be false in production builds
const DEBUG_MSG_HANDLER = false; 

function logMessageHandlerDebug(...args) {
  if (DEBUG_MSG_HANDLER) {
    console.log("[CoPrompt MH Debug]", ...args);
  }
}

// --- Internal Helpers ---

// Handles request from injected script to get API key
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _handleApiKeyRequest(_event) {
  logDebug("Handling API key request from injected script");
  chrome.runtime.sendMessage({ type: "GET_API_KEY" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting API key:", chrome.runtime.lastError);
      window.postMessage(
        {
          type: "CoPromptAPIKeyResponse",
          key: null,
          error: chrome.runtime.lastError.message,
        },
        "*",
      );
      return;
    }
    if (response?.key) {
      logDebug("Got API key, sending response to injected script");
      window.postMessage(
        { type: "CoPromptAPIKeyResponse", key: response.key },
        "*",
      );
    } else {
      console.error("API key retrieval failed in background script");
      window.postMessage(
        {
          type: "CoPromptAPIKeyResponse",
          key: null,
          error: "Failed to retrieve API key from background.",
        },
        "*",
      );
    }
  });
}

// Handles request from injected script to enhance prompt
async function _handleEnhanceRequest(event) {
  logMessageHandlerDebug("Handling EnhanceRequest from injected script:", event.data);

  // Note: Context extraction logic might need refinement based on target site
  let conversationContext = [];
  try {
    // Assuming getConversationContext is available globally or imported correctly
    // Ensure this function exists and works as expected
    if (typeof getConversationContext === 'function') {
        conversationContext = getConversationContext();
        logMessageHandlerDebug("Captured Context:", conversationContext ? JSON.stringify(conversationContext).substring(0, 200) + '...' : 'null');
    } else {
        logMessageHandlerDebug("getConversationContext function not found.");
    }
  } catch (error) {
    console.error("[CoPrompt MH] Error during context extraction:", error);
    // Proceed without context if extraction fails
  }

  const requestStartTime = Date.now();
  logMessageHandlerDebug("Establishing connection to background script at", new Date().toISOString());

  // --- Use Long-Lived Port (Robust MV3 Communication) --- 
  let port = null;
  try {
    port = chrome.runtime.connect({ name: "enhancer" });
    logMessageHandlerDebug("[MessageHandler] Port connected.");

    let responseReceived = false;

    // Listener for responses from the background script via this port
    port.onMessage.addListener((response) => {
      responseReceived = true;
      const requestTime = (Date.now() - requestStartTime) / 1000;
      logMessageHandlerDebug(
        `[MessageHandler] Received response via port after ${requestTime.toFixed(2)} seconds:`,
        response ? JSON.stringify(response).substring(0,150)+'...' : response,
      );

      // Forward background response (or error) to injected script
      if (response.error) {
        logMessageHandlerDebug("[MessageHandler] Forwarding error response to injected script:", response.error);
        window.postMessage(
          { type: "CoPromptEnhanceResponse", error: response.error },
          "*",
        );
      } else if (response.enhancedPrompt) {
        logMessageHandlerDebug("[MessageHandler] Forwarding success response to injected script.");
        window.postMessage(
          {
            type: "CoPromptEnhanceResponse",
            enhancedPrompt: response.enhancedPrompt,
          },
          "*",
        );
      } else {
        console.error("[MessageHandler] Unexpected response format via port", response);
        window.postMessage(
          {
            type: "CoPromptEnhanceResponse",
            error: "Invalid response format from background via port.",
          },
          "*",
        );
      }

      // Disconnect port after receiving response
      if (port) {
          logMessageHandlerDebug("[MessageHandler] Disconnecting port after message.");
          try { port.disconnect(); } catch (e) { /* Ignore errors if already disconnected */ }
          port = null;
      }
    });

    // Listener for port disconnection (error handling)
    port.onDisconnect.addListener(() => {
      const wasConnected = !!port;
      const lastErrorMessage = chrome.runtime.lastError?.message;
      logMessageHandlerDebug(`[MessageHandler] Port disconnected. Was Connected: ${wasConnected}, Error: ${lastErrorMessage || '(none)'}`);
      
      if (wasConnected && !responseReceived) { 
          // Log foundational error (Story 1.2)
          console.error("[CoPrompt MH Error] E_PORT_DISCONNECTED: Port disconnected unexpectedly before response.", lastErrorMessage || "(No error message)");
          window.postMessage(
            {
              type: "CoPromptEnhanceResponse",
              error: `Connection to background service lost unexpectedly. ${lastErrorMessage || ''}`.trim(),
            },
            "*",
          );
      }
      port = null;
    });

    // Send the actual request through the port
    logMessageHandlerDebug("[MessageHandler] Posting ENHANCE_PROMPT message via port.");
    port.postMessage({
        type: "ENHANCE_PROMPT",
        prompt: event.data.prompt,
        systemInstruction: event.data.systemInstruction,
        conversationContext: conversationContext,
    });

  } catch (error) {
    // Log foundational error (Story 1.2)
    console.error("[CoPrompt MH Error] E_PORT_CONNECTION_FAILED: Error establishing port connection:", error);
    window.postMessage(
      {
        type: "CoPromptEnhanceResponse",
        error: `Failed to connect to background service: ${error.message}`,
      },
      "*",
    );
    // Ensure port is cleaned up if connection failed
    if (port) {
        try { port.disconnect(); } catch (e) {} 
        port = null;
    }
  }
}

// Handles response *intended for the DOM/user* which originates from injected script
// (e.g., after background script replies to injected script)
async function _handleDomUpdateResponse(event) {
  logMessageHandlerDebug("Handling DOM update response (originated from injected):", event.data);
  // Resetting button state is now handled within injected.js
  // Updating input is now handled within injected.js
  // This function might only be needed if content script needs to do DOM updates
}

/**
 * Forwards error details received from the injected script to the background script.
 * @param {object} errorDetail The error detail object from the message.
 */
function _forwardErrorToBackground(errorDetail) {
  logMessageHandlerDebug("Forwarding error to background script:", errorDetail);
  chrome.runtime.sendMessage(
    {
      type: "REPORT_ERROR_FROM_CONTENT",
      payload: errorDetail,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "[CoPrompt MH Error] Error sending error report to background:",
          chrome.runtime.lastError.message,
        );
      } else {
        logMessageHandlerDebug("Error report sent to background successfully.", response);
      }
    },
  );
}

/**
 * Main handler for window.postMessage events, delegating to specific handlers.
 * @param {MessageEvent} event The message event.
 */
export async function handleWindowMessage(event) {
  if (event.source !== window || !event.data?.type) return;
  // Only log our types if debug enabled
  if (DEBUG_MSG_HANDLER && event.data.type.startsWith("CoPrompt")) {
     logMessageHandlerDebug("[MessageHandler] Received message:", event.data.type, event.data);
  }

  switch (event.data.type) {
    case "CoPromptGetAPIKey": // Request from injected script
      _handleApiKeyRequest(event);
      break;
    case "CoPromptEnhanceRequest": // Request from injected script
      await _handleEnhanceRequest(event);
      break;
    case "CoPromptEnhanceResponse": 
      // This case might become redundant if injected.js handles the response fully
      // Keeping it for now, but _handleDomUpdateResponse might be empty
      await _handleDomUpdateResponse(event);
      break;
    case "CoPromptReportError": // Error reported from injected script
      if (event.data.detail) {
         _forwardErrorToBackground(event.data.detail);
      } else {
         console.warn("[CoPrompt MH] Received CoPromptReportError without detail object.");
      }
      break;
    // Add other message type handlers here if needed
    default:
      // Avoid logging all messages unless debugging
      // logMessageHandlerDebug("[MessageHandler] Unhandled message type:", event.data.type);
      break;
  }
}

// Initial log to confirm script loading
console.log("CoPrompt: messageHandler.js loaded and listener attached.");
