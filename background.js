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
    // New handler for direct messages
    (async () => {
      const {
        prompt: originalPrompt,
        // systemInstruction, // System instruction can be default for now or added later
        context,
        requestId, // from content script
      } = request;

      // Default system instruction if not provided in request (though it usually is)
      const systemContent =
        context?.systemInstruction ||
        "You are a helpful AI assistant. Your primary goal is to rephrase and enhance the user's prompt to be more effective when interacting with a Large Language Model. You should make the prompt clearer, more concise, and more specific. Your response should ONLY be the enhanced prompt itself, without any preamble or explanation.";

      try {
        console.log(`[Background] Calling Supabase function for ENHANCE_PROMPT_REQUEST (ID: ${requestId}). Prompt:`, originalPrompt);
        
        // --- PX-06: Get Device ID ---
        const deviceId = await getOrCreateDeviceId();
        console.log(`[Background] Using Device ID for request (ID: ${requestId}):`, deviceId);

        // callOpenAI now returns an object: { enhancedPrompt: string, usage: object }
        const apiResponse = await callOpenAI(
          null, // API key - not used by apiClient when talking to Supabase proxy (anon key is hardcoded there)
          systemContent, // Pass the system instruction
          originalPrompt, // Pass the original prompt as the userPrompt
          deviceId // --- PX-06: Pass Device ID ---
        );

        console.log(`[Background] Supabase function call successful (ID: ${requestId}), received:`, apiResponse);
        
        // --- PX-05: Store Token Usage --- 
        if (apiResponse.usage) {
          try {
            const currentUsage = await chrome.storage.local.get([
              "total_prompt_tokens", 
              "total_completion_tokens", 
              "total_tokens_all_time"
            ]);
            
            const newPromptTokens = (currentUsage.total_prompt_tokens || 0) + (apiResponse.usage.prompt_tokens || 0);
            const newCompletionTokens = (currentUsage.total_completion_tokens || 0) + (apiResponse.usage.completion_tokens || 0);
            const newTotalTokensAllTime = (currentUsage.total_tokens_all_time || 0) + (apiResponse.usage.total_tokens || 0);

            await chrome.storage.local.set({
              total_prompt_tokens: newPromptTokens,
              total_completion_tokens: newCompletionTokens,
              total_tokens_all_time: newTotalTokensAllTime,
              last_usage_update: new Date().toISOString(),
            });
            console.log("[Background] Token usage updated in storage.", 
              { newPromptTokens, newCompletionTokens, newTotalTokensAllTime });
          } catch (storageError) {
            backgroundLogger.error("Error updating token usage in storage", {
              code: "E_TOKEN_STORAGE_ERROR",
              error: storageError,
              requestId: requestId,
            });
          }
        }
        // --- End PX-05 --- 

        sendResponse({
          type: "ENHANCE_PROMPT_RESPONSE", // Consistent response type
          enhancedPrompt: apiResponse.enhancedPrompt, // Pass the enhanced prompt string
          usage: apiResponse.usage, // Pass the usage object
          requestId: requestId,
        });
      } catch (error) {
        backgroundLogger.error("Error during ENHANCE_PROMPT_REQUEST process", {
          code: "E_BACKGROUND_ENHANCE_ERROR",
          error: error,
          prompt: originalPrompt,
          context: context,
          requestId: requestId,
        });
        sendResponse({
          type: "ERROR_RESPONSE", // Consistent error response type
          error:
            error.message || "Unknown background error during enhancement.",
          requestId: requestId,
        });
      }
    })();
    return true; // Crucial: Indicate async response for sendResponse
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

// --- PX-06/A-01: Device ID Management ---
async function getOrCreateDeviceId() {
  const result = await chrome.storage.sync.get("coprompt_device_id");
  let deviceId = result.coprompt_device_id;

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.sync.set({ "coprompt_device_id": deviceId });
    console.log("[Background] New Device ID created and stored in sync storage:", deviceId);
  } else {
    console.log("[Background] Existing Device ID retrieved from sync storage:", deviceId);
  }
  return deviceId;
}

// Example of how to call it (e.g., on service worker startup, or when needed)
// We can call this when the service worker first loads to ensure a deviceId exists.
getOrCreateDeviceId().then(id => {
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
