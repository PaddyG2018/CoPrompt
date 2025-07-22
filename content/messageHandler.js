// Handles messages received via window.postMessage

// REMOVED import { DEBUG } from "./config.js";
// import { /* findActiveInputElementValue, */ findActiveInputElement, updateInputElement } from "./utils/domUtils.js"; // Not used directly here
// import { makeDraggable } from "./content/interactionHandler.js"; // Not used directly here
// import { handleWindowMessage } from "./content/messageHandler.js"; // This is the current file
import { getConversationContext } from "../content.js"; // Import the function
import { MAIN_SYSTEM_INSTRUCTION } from "../utils/constants.js"; // Import sophisticated system prompt

// Flag for enabling debug logs specifically in this module
// Set this to true manually for local debugging, should be false in production builds
const DEBUG_MSG_HANDLER = false;

function logMessageHandlerDebug(...args) {
  if (DEBUG_MSG_HANDLER) {
    // Keep conditional logic if desired, but comment out the log itself for now
    console.log("[CoPrompt MH Debug]", ...args);
  }
}

// --- Internal Helpers ---

// Removed _handleApiKeyRequest function

// Removed _handleDomUpdateResponse function

/**
 * Forwards error details received from the injected script to the background script.
 * @param {object} errorDetail The error detail object from the message.
 */
function _forwardErrorToBackground(errorDetail) {
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
      }
    },
  );
}

/**
 * Handles messages received via window.postMessage FROM the injected script.
 */
export async function handleWindowMessage(event) {
  // Basic validation: Check source and if data/type exist
  if (event.source !== window || !event.data?.type) {
    return;
  }

  const { type, prompt, context, requestId, key, error, detail } = event.data;

  // CRITICAL FIX: Ignore response messages that are being sent TO the injected script
  // These are messages we forward from background script, not messages FROM injected script
  if (type === "CoPromptEnhanceResponse" || type === "CoPromptErrorResponse") {
    logMessageHandlerDebug(
      "Ignoring response message being forwarded to injected script:",
      type,
    );
    return;
  }

  logMessageHandlerDebug(
    "Received message from injected script:",
    type,
    event.data,
  );

  switch (type) {
    case "CoPromptEnhanceRequest": // Message from injected.js asking us to enhance
      logMessageHandlerDebug(
        `Handling EnhanceRequest (ID: ${requestId}):`,
        event.data,
      );
      if (!requestId) {
        console.error("[CoPrompt MH Error] Enhance request missing requestId.");
        return;
      }

      // --- Port Communication Logic Moved Here ---
      let port = null;
      try {
        port = chrome.runtime.connect({ name: "enhancer" });

        // **NEW: Explicitly check for connection error (like invalidated context)**
        if (chrome.runtime.lastError) {
          console.error(
            "[CoPrompt MH Error] E_PORT_CONNECTION_IMMEDIATE_FAIL: chrome.runtime.connect failed:",
            chrome.runtime.lastError.message,
          );
          // Post the specific lastError message
          window.postMessage(
            {
              type: "CoPromptErrorResponse",
              error: `Failed to connect to background service: ${chrome.runtime.lastError.message}`,
              requestId: requestId,
            },
            "*",
          );
          port = null; // Ensure port is marked null
          // No need to proceed further if connection failed immediately
          return; // Exit the CoPromptEnhanceRequest case
        }

        // **NEW: Check if port is null even if no lastError (defensive)**
        if (!port) {
          console.error(
            "[CoPrompt MH Error] E_PORT_NULL: chrome.runtime.connect returned null port without lastError.",
          );
          window.postMessage(
            {
              type: "CoPromptErrorResponse",
              error:
                "Failed to connect to background service: Port not established.",
              requestId: requestId,
            },
            "*",
          );
          return; // Exit
        }

        logMessageHandlerDebug(
          "[MessageHandler] Port connected for EnhanceRequest.",
        );

        port.onDisconnect.addListener(() => {
          const lastErrorMessage = chrome.runtime.lastError?.message;
          logMessageHandlerDebug(
            `[MessageHandler] Port disconnected. Error: ${lastErrorMessage || "(none)"}`,
          );
          if (port) {
            // Check if we still expected the port to be valid
            console.error(
              "[CoPrompt MH Error] E_PORT_DISCONNECTED: Port disconnected unexpectedly before response.",
              lastErrorMessage || "(No error message)",
            );
            window.postMessage(
              {
                type: "CoPromptErrorResponse",
                error:
                  `Connection to background service lost unexpectedly. ${lastErrorMessage || ""}`.trim(),
                requestId: requestId,
              },
              "*",
            );
          }
          port = null; // Ensure port is marked as null
        });

        port.onMessage.addListener((response) => {
          logMessageHandlerDebug(
            `[MessageHandler] Received message from background port (ID: ${requestId}):`,
            response,
          );
          if (response.requestId === requestId) {
            // Forward the success or error response back to the injected script
            window.postMessage(response, "*");
            if (port) {
              logMessageHandlerDebug(
                `[MessageHandler] Disconnecting port cleanly (ID: ${requestId}).`,
              );
              try {
                port.disconnect();
              } catch (e) {
                console.warn(
                  "[MessageHandler] Error during explicit port disconnect:",
                  e,
                );
              }
              port = null; // Mark port as disconnected
            }
          } else {
            console.warn(
              `[MessageHandler] Received response for mismatched requestId. Expected: ${requestId}, Got: ${response.requestId}`,
            );
          }
        });

        // Send the actual request TO the background script via the port
        logMessageHandlerDebug(
          `[MessageHandler] Posting ENHANCE_PROMPT message via port (ID: ${requestId}).`,
        );
        port.postMessage({
          type: "ENHANCE_PROMPT",
          prompt: prompt, // Use prompt from event data
          systemInstruction: MAIN_SYSTEM_INSTRUCTION, // ✅ Send sophisticated system prompt!
          conversationContext: context, // Use context from event data
          requestId: requestId,
        });
      } catch (error) {
        // This will now catch errors from using a valid port, or other synchronous issues
        console.error(
          "[CoPrompt MH Error] E_PORT_USAGE_ERROR: Error using port or other synchronous failure:",
          error,
        );
        window.postMessage(
          {
            type: "CoPromptErrorResponse",
            error: `Error during background service communication: ${error.message}`,
            requestId: requestId,
          },
          "*",
        );
        if (port) {
          try {
            port.disconnect();
          } catch (e) {}
          port = null;
        }
      }
      // --- End Port Communication Logic ---
      break;

    case "CoPromptAPIKeyResponse":
      // This originates from the background script response handled by _handleApiKeyRequest,
      // which posts it back to the window. We shouldn't handle it here again.
      // logMessageHandlerDebug("Ignoring CoPromptAPIKeyResponse (handled by original requestor)");
      break;

    case "CoPromptReportError":
      _forwardErrorToBackground(detail); // Call existing helper
      break;

    default:
      logMessageHandlerDebug("Ignoring unknown message type:", type);
  }
}
