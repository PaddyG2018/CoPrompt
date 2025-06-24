const DEBUG = true; // Define DEBUG at the top of the file

import {
  DEFAULT_SYSTEM_INSTRUCTION,
  MAIN_SYSTEM_INSTRUCTION,
  MAX_CONTEXT_ITEMS,
} from "./utils/constants.js";
import { callOpenAI } from "./background/apiClient.js";
import { createLogger } from "./utils/logger.js"; // Import createLogger

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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(`[Background Main Listener] Received ${request.type} request`); // Keep basic log

  if (request.type === "ENHANCE_PROMPT_REQUEST") {
    if (DEBUG)
      console.log("[Background] Received ENHANCE_PROMPT_REQUEST:", request);

    // Correctly extract data based on what content.js sends (and sender object)
    const userPromptFromRequest = request.prompt; // content.js sends 'prompt'
    const contextFromRequest = request.context;
    const targetInputIdFromRequest = request.targetInputId; // Hope content.js sends this
    const tabIdFromSender = sender.tab?.id; // Get tabId from sender

    // Derive system instruction
    const systemInstructionForApi =
      contextFromRequest?.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

    if (!tabIdFromSender) {
      console.error(
        "[Background] Missing tabId for ENHANCE_PROMPT_REQUEST. Cannot send response.",
        request,
      );
      // Potentially send an error back to a generic error handler or log to Sentry if implemented
      return true; // Still async, but won't proceed to callOpenAI if no tabId
    }
    if (!userPromptFromRequest) {
      console.error(
        "[Background] Missing prompt for ENHANCE_PROMPT_REQUEST.",
        request,
      );
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
      chrome.storage.local
        .get("supabase_session")
        .then((data) => data.supabase_session),
    ])
      .then(([deviceId, session]) => {
        const userAccessToken = session?.access_token || null;
        if (DEBUG)
          console.log(
            "[Background] Retrieved Device ID:",
            deviceId,
            "User Access Token present:",
            !!userAccessToken,
          );

        // Call the API client (now with JWT for V2)
        callOpenAI(
          null,
          systemInstructionForApi,
          userPromptFromRequest,
          deviceId,
          userAccessToken,
        )
          .then((response) => {
            if (DEBUG)
              console.log("[Background] Response from callOpenAI:", response);
            chrome.tabs.sendMessage(tabIdFromSender, {
              // Use tabIdFromSender
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
          .catch((error) => {
            console.error(
              "[Background] Error calling OpenAI or processing response:",
              error,
            );
            chrome.tabs.sendMessage(tabIdFromSender, {
              // Use tabIdFromSender
              type: "ENHANCE_PROMPT_ERROR",
              error: error.message,
              targetInputId: targetInputIdFromRequest, // Use targetInputIdFromRequest
              requestId: request.requestId,
            });
          });
      })
      .catch((error) => {
        console.error(
          "[Background] Error retrieving deviceId or session:",
          error,
        );
        chrome.tabs.sendMessage(tabIdFromSender, {
          // Use tabIdFromSender
          type: "ENHANCE_PROMPT_ERROR",
          error:
            "Failed to retrieve necessary authentication details. Please try again.",
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
  } else if (request.type === "SEND_MAGIC_LINK") {
    // V2A-02: Handle magic link sending
    console.log("[Background] Received SEND_MAGIC_LINK request for:", request.email);
    
    try {
      // For now, open the options page with a pre-filled email
      // In a full implementation, this would integrate with Supabase Auth
      const optionsUrl = chrome.runtime.getURL('options.html') + '?email=' + encodeURIComponent(request.email);
      chrome.tabs.create({ url: optionsUrl }, (tab) => {
        sendResponse({ 
          success: true, 
          message: 'Please complete signup in the new tab that opened.' 
        });
      });
    } catch (error) {
      console.error("[Background] Error handling magic link request:", error);
      sendResponse({ 
        success: false, 
        error: 'Failed to open signup page. Please try again.' 
      });
    }
    return true; // Indicates async response
  } else if (request.type === "OPEN_OPTIONS_PAGE") {
    // V2A-02: Open options page
    console.log("[Background] Opening options page");
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    // No response needed
  }
  // Note: No need to return true for synchronous handlers above
});

// --- Token usage tracking (V2 analytics) ---
async function storeTokenUsage(usage) {
  try {
    const timestamp = new Date().toISOString();

    // Store token usage locally for aggregation (can be sent to analytics later)
    const result = await chrome.storage.local.get("token_usage_log");
    const existingLog = result.token_usage_log || [];

    // Add new usage entry
    existingLog.push({
      timestamp,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    });

    // Keep only the last 100 entries to prevent storage bloat
    const trimmedLog = existingLog.slice(-100);

    await chrome.storage.local.set({ token_usage_log: trimmedLog });

    if (DEBUG) {
      console.log("[Background] Token usage stored:", usage);
    }
  } catch (error) {
    console.error("[Background] Error storing token usage:", error);
    backgroundLogger.error("Failed to store token usage", {
      code: "E_TOKEN_STORAGE_FAILED",
      error: error,
      usage: usage,
    });
  }
}

// --- Device ID Management (V2 analytics) ---
async function getOrCreateDeviceId() {
  const result = await chrome.storage.sync.get("coprompt_device_id");
  let deviceId = result.coprompt_device_id;

  if (!deviceId) {
    // Generate a new UUID-like device ID
    deviceId = crypto.randomUUID ? crypto.randomUUID() : 
      'device-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
    
    await chrome.storage.sync.set({
      coprompt_device_id: deviceId,
      device_created_at: new Date().toISOString(),
    });
    
    console.log(
      "[Background] Generated new Device ID:",
      deviceId,
    );
  }
  return deviceId;
}

// Initialize device ID when service worker starts
getOrCreateDeviceId().then((id) => {
  console.log("[Background] Current Device ID for session:", id);
});

// --- Service Worker Lifecycle Listeners ---
chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    `[Background] Extension installed or updated. Reason: ${details.reason}`,
  );
  // Perform any first-time setup or migration tasks here
});

self.addEventListener("activate", (event) => {
  console.log("[Background] Service worker activated.");
});

self.addEventListener("install", (event) => {
  console.log("[Background] Service worker installed.");
});
