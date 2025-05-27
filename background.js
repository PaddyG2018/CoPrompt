const DEBUG = true; // Define DEBUG at the top of the file

import {
  DEFAULT_SYSTEM_INSTRUCTION,
  MAIN_SYSTEM_INSTRUCTION,
  MAX_CONTEXT_ITEMS,
} from "./utils/constants.js";
import { callOpenAI } from "./background/apiClient.js";
import { createLogger } from "./utils/logger.js"; // Import createLogger
import { encryptAPIKey, decryptAPIKey } from "./utils/secureApiKey.js"; // Correct path

// Instantiate logger for background context
const backgroundLogger = createLogger("background");

// Helper function to format conversation context
function formatConversationContext(context) {
  if (!context || !Array.isArray(context) || context.length === 0) {
    return null; // Return null if no context
  }

  // Limit context to the last MAX_CONTEXT_ITEMS items
  const recentContext = context.slice(-MAX_CONTEXT_ITEMS);

  // Format context clearly
  const formatted = recentContext
    .map((msg) => {
      // Ensure roles are consistently capitalized if needed by the prompt
      const role = msg.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${msg.content}`;
    })
    .join("\n\n");

  // Add delimiters for clarity in the final prompt
  return `--- Conversation Context ---\n${formatted}\n--- End Context ---`;
}

// --- Listener for Simple One-Time Messages ---
// Make listener synchronous again by default
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(`[Background Main Listener] Received ${request.type} request`); // Keep basic log

  if (request.type === "SAVE_API_KEY") {
    // This handler uses sendResponse asynchronously
    (async () => {
      try {
        const encryptedKey = await encryptAPIKey(request.apiKey);
        chrome.storage.local.set({ openai_api_key: encryptedKey }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error saving API key:", chrome.runtime.lastError);
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            console.log("API Key saved successfully.");
            sendResponse({ success: true });
          }
        });
      } catch (error) {
        console.error("Encryption/Save error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Indicate async response
  } else if (request.type === "CLEAR_API_KEY") {
    // This handler uses sendResponse asynchronously
    chrome.storage.local.remove("openai_api_key", () => {
      if (chrome.runtime.lastError) {
        console.error("Error clearing API key:", chrome.runtime.lastError);
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        console.log("API Key cleared successfully.");
        sendResponse({ success: true });
      }
    });
    return true; // Indicate async response
  } else if (request.type === "ENHANCE_PROMPT_REQUEST") {
    if (DEBUG) console.log("[Background] Received ENHANCE_PROMPT_REQUEST:", request);
    
    // Correctly extract data based on what content.js sends (and sender object)
    const userPromptFromRequest = request.prompt; // content.js sends 'prompt'
    const contextFromRequest = request.context;
    const targetInputIdFromRequest = request.targetInputId; // Hope content.js sends this
    const tabIdFromSender = sender.tab?.id; // Get tabId from sender

    // Derive system instruction
    const systemInstructionForApi = contextFromRequest?.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

    if (!tabIdFromSender) {
      console.error("[Background] Missing tabId for ENHANCE_PROMPT_REQUEST. Cannot send response.", request);
      // Potentially send an error back to a generic error handler or log to Sentry if implemented
      return true; // Still async, but won't proceed to callOpenAI if no tabId
    }
    if (!userPromptFromRequest) {
      console.error("[Background] Missing prompt for ENHANCE_PROMPT_REQUEST.", request);
      chrome.tabs.sendMessage(tabIdFromSender, {
        type: "ENHANCE_PROMPT_ERROR",
        error: "Prompt was missing in the request.",
        targetInputId: targetInputIdFromRequest,
        requestId: request.requestId,
      });
      return true;
    }

    // PX-07.A-05: Get Device ID and User JWT
    Promise.all([
      getOrCreateDeviceId(),
      chrome.storage.local.get("supabase_session").then(data => data.supabase_session)
    ]).then(([deviceId, session]) => {
      const userAccessToken = session?.access_token || null;
      if (DEBUG) console.log("[Background] Retrieved Device ID:", deviceId, "User Access Token present:", !!userAccessToken);

      // Call the API client (now potentially with JWT)
      callOpenAI(null, systemInstructionForApi, userPromptFromRequest, deviceId, userAccessToken)
        .then(response => {
          if (DEBUG) console.log("[Background] Response from callOpenAI:", response);
          chrome.tabs.sendMessage(tabIdFromSender, { // Use tabIdFromSender
            type: "ENHANCE_PROMPT_RESPONSE",
            enhancedPrompt: response.enhancedPrompt,
            targetInputId: targetInputIdFromRequest, // Use targetInputIdFromRequest
            usage: response.usage,
            requestId: request.requestId,
          });

          if (response.usage) {
            storeTokenUsage(response.usage);
          }
        })
        .catch(error => {
          console.error("[Background] Error calling OpenAI or processing response:", error);
          chrome.tabs.sendMessage(tabIdFromSender, { // Use tabIdFromSender
            type: "ENHANCE_PROMPT_ERROR",
            error: error.message,
            targetInputId: targetInputIdFromRequest, // Use targetInputIdFromRequest
            requestId: request.requestId,
          });
        });
    }).catch(error => {
      console.error("[Background] Error retrieving deviceId or session:", error);
      chrome.tabs.sendMessage(tabIdFromSender, { // Use tabIdFromSender
        type: "ENHANCE_PROMPT_ERROR",
        error: "Failed to retrieve necessary authentication details. Please try again.",
        targetInputId: targetInputIdFromRequest, // Use targetInputIdFromRequest
        requestId: request.requestId,
      });
    });
    return true; // Indicates that the response will be sent asynchronously
  } else if (request.type === "REPORT_ERROR_FROM_CONTENT") {
    // Synchronous handler now, just calls the simplified reportError
    console.log(
      "[Background] Received error report from content script:",
      request.payload,
    );
    const { code, message, stack, context } = request.payload || {};
    // Use logger instance
    backgroundLogger.error(message || "Unknown error from content script", {
      code: code || "E_UNKNOWN_CONTENT_SCRIPT",
      stack: stack,
      context: context,
      source: "contentScriptViaInjected",
    });
    // No response needed/sent
    // Return false or nothing (default for sync handlers)
  }
  // Removed TEST_SENTRY handler

  // Default return for synchronous handlers (or handlers not using sendResponse)
  return false;
});

// --- PX-05: Token Usage Storage ---
async function storeTokenUsage(usage) {
  if (!usage) {
    console.warn("[Background] storeTokenUsage called with no usage data.");
    return;
  }
  try {
    const currentUsage = await chrome.storage.local.get([
      "total_prompt_tokens",
      "total_completion_tokens",
      "total_tokens_all_time",
    ]);

    const newPromptTokens =
      (currentUsage.total_prompt_tokens || 0) +
      (usage.prompt_tokens || 0);
    const newCompletionTokens =
      (currentUsage.total_completion_tokens || 0) +
      (usage.completion_tokens || 0);
    const newTotalTokensAllTime =
      (currentUsage.total_tokens_all_time || 0) +
      (usage.total_tokens || 0);

    await chrome.storage.local.set({
      total_prompt_tokens: newPromptTokens,
      total_completion_tokens: newCompletionTokens,
      total_tokens_all_time: newTotalTokensAllTime,
      last_usage_update: new Date().toISOString(),
    });
    if (DEBUG) console.log("[Background] Token usage updated in storage:", {
      newPromptTokens,
      newCompletionTokens,
      newTotalTokensAllTime,
    });
  } catch (error) {
    console.error("[Background] Error updating token usage in storage:", error);
    // Optionally use backgroundLogger for more structured logging if available
    // backgroundLogger.error("Error updating token usage in storage", { code: "E_TOKEN_STORAGE_ERROR", error });
  }
}
// --- End PX-05 ---

// --- PX-06/A-01: Device ID Management ---
async function getOrCreateDeviceId() {
  const result = await chrome.storage.sync.get("coprompt_device_id");
  let deviceId = result.coprompt_device_id;

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.sync.set({ coprompt_device_id: deviceId });
    console.log(
      "[Background] New Device ID created and stored in sync storage:",
      deviceId,
    );
  } else {
    console.log(
      "[Background] Existing Device ID retrieved from sync storage:",
      deviceId,
    );
  }
  return deviceId;
}

// Example of how to call it (e.g., on service worker startup, or when needed)
// We can call this when the service worker first loads to ensure a deviceId exists.
getOrCreateDeviceId().then((id) => {
  console.log("[Background] Current Device ID for session:", id);
});
// --- End PX-06/A-01 ---

// --- Listener for Long-Lived Port Connections ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "enhancer") {
    // console.log("[Background Port Listener] Enhancer port connected."); // REMOVE log

    // Add listener to detect disconnect from background side
    port.onDisconnect.addListener(() => {
      const lastError =
        chrome.runtime.lastError?.message || "(No error message)";
      // console.log(`[Background Port Listener] Enhancer port disconnected. Last error: ${lastError}`); // REMOVE log
    });

    port.onMessage.addListener(async (message) => {
      // console.log("[Background Port Listener] Received message inside port:", message); // REMOVE log
      if (message.type === "ENHANCE_PROMPT") {
        // Extract requestId from the incoming message
        const {
          prompt: originalPrompt,
          systemInstruction,
          conversationContext,
          requestId,
        } = message; // Rename prompt to originalPrompt for clarity

        if (!requestId) {
          // Should not happen if messageHandler validates, but good practice
          backgroundLogger.error("ENHANCE_PROMPT message missing requestId", {
            code: "E_MISSING_REQUEST_ID",
            source: "portListener",
          });
          console.error(
            "[Background Port Listener] Received ENHANCE_PROMPT without requestId.",
          ); // Keep Error
          // Cannot easily send error back with original ID here
          return;
        }

        // console.log(`[Background Port Listener] Processing ENHANCE_PROMPT (ID: ${requestId})`); // REMOVE log
        try {
          // console.log(`[Background Port Listener] Attempting to retrieve API key (ID: ${requestId})`); // REMOVE log
          // 1. Retrieve the stored API key
          const storageData = await chrome.storage.local.get("openai_api_key");
          const encryptedKey = storageData.openai_api_key;

          if (!encryptedKey) {
            console.error(
              `[Background Port Listener] API key not found (ID: ${requestId})`,
            ); // Keep Error
            backgroundLogger.error("API key not found in storage.", {
              code: "E_API_KEY_MISSING",
              source: "portListener",
              requestId: requestId,
            });
            port.postMessage({
              type: "CoPromptErrorResponse",
              error: "API key not set. Please set it in the extension options.",
              requestId: requestId,
            });
            return; // Stop processing if key is missing
          }

          // 2. Decrypt the API key
          let apiKey = null;
          // console.log(`[Background Port Listener] Attempting to decrypt API key (ID: ${requestId})`); // REMOVE log
          try {
            apiKey = await decryptAPIKey(encryptedKey);
            if (apiKey) {
              // console.log(`[Background Port Listener] API key decrypted successfully (ID: ${requestId})`); // REMOVE log
            } else {
              // Decryption succeeded but returned null/empty
              console.error(
                `[Background Port Listener] Decryption resulted in null/empty key (ID: ${requestId})`,
              ); // Keep Error
              backgroundLogger.error("Decryption resulted in null/empty key.", {
                code: "E_DECRYPTION_EMPTY",
                source: "portListener",
                requestId: requestId,
              });
              port.postMessage({
                type: "CoPromptErrorResponse",
                error: "API key decryption failed (empty result).",
                requestId: requestId,
              });
              return; // Stop processing if key is empty after decryption
            }
          } catch (decryptionError) {
            console.error(
              `[Background Port Listener] Decryption failed (ID: ${requestId}):`,
              decryptionError,
            ); // Keep Error
            // Pass the error object directly to the logger
            backgroundLogger.error("Decryption failed", {
              code: "E_DECRYPTION_FAILED",
              source: "portListener",
              error: decryptionError, // Pass the actual error
              requestId: requestId,
            });
            port.postMessage({
              type: "CoPromptErrorResponse",
              error: "Failed to decrypt API key.",
              requestId: requestId,
            });
            return; // Stop processing if decryption fails
          }

          // If we reach here, apiKey should be valid

          // 3. Prepare the prompt
          const contextString = formatConversationContext(conversationContext);
          const systemContent = systemInstruction || MAIN_SYSTEM_INSTRUCTION;
          const userPrompt = `${originalPrompt}${contextString ? `\n\n${contextString}` : ""}`;

          // 4. Call Supabase Function (callOpenAI now calls Supabase and returns a string)
          // console.log(`[Background Port Listener] Calling Supabase function (ID: ${requestId})...`);
          const enhancedMessageString = await callOpenAI(
            apiKey,
            userPrompt,
            systemContent,
          ); // callOpenAI now returns a string

          // console.log(`[Background Port Listener] Supabase function call successful (ID: ${requestId}), sending response.`);
          // 5. Send the response back to the content script
          port.postMessage({
            type: "CoPromptEnhanceResponse", // This is handled by injected.js
            data: enhancedMessageString, // Assign the string directly
            usage: null, // Explicitly null for now
            requestId: requestId,
          });
        } catch (error) {
          console.error(
            `[Background Port Listener] Error during enhancement process (ID: ${requestId}):`,
            error,
          ); // Keep Error
          backgroundLogger.error("Error during enhancement process", {
            code: "E_BACKGROUND_ERROR",
            error: error, // Pass the actual error
            prompt: originalPrompt,
            context: conversationContext,
            requestId: requestId,
          });
          // Include requestId in the error response
          // console.log(`[Background Port Listener] Posting error response via port (ID: ${requestId})`); // REMOVE log
          port.postMessage({
            type: "CoPromptErrorResponse",
            error: error.message || "Unknown background error",
            requestId: requestId,
          });
        }
      } else {
        console.warn(
          `[Background Port Listener] Received unknown message type: ${message.type}`,
        ); // Keep Warn
        // Use the logger instance
        backgroundLogger.warn(
          `Received unknown message type via port: ${message.type}`,
          {
            code: "E_UNKNOWN_MESSAGE_TYPE",
            source: "portListener",
            messageObject: message,
          },
        );
      }
    });
  }
});

// --- Other Service Worker Lifecycle Listeners ---

chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    `[Background] Extension installed or updated. Reason: ${details.reason}`,
  );
  // Perform any first-time setup or migration tasks here
});

self.addEventListener("activate", (event) => {
  console.log("[Background] Service worker activated.");
  // You might want to claim clients here if needed immediately
  // event.waitUntil(self.clients.claim());
});

self.addEventListener("install", (event) => {
  console.log("[Background] Service worker installed.");
  // Perform installation tasks like caching assets if needed
  // event.waitUntil(self.skipWaiting()); // Optional: Force activation
});

// console.log("CoPrompt Background Script Loaded (v2 - Sentry Helper Added)"); // REMOVE log
