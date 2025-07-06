const DEBUG = false; // Define DEBUG at the top of the file

// Supabase Configuration
const SUPABASE_URL = "https://evfuyrixpjgfytwfijpx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZnV5cml4cGpnZnl0d2ZpanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODA0MDIsImV4cCI6MjA1OTY1NjQwMn0.GD6oTrvjKMdqSK4LgyRmD0E1k0zbKFg79sAlXy-fLyc";

// Request deduplication for magic links
const recentMagicLinkRequests = new Map();
const REQUEST_COOLDOWN = 10000; // 10 seconds cooldown

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

    // PX-07.A-05: Get User JWT (deviceId now only for analytics)
    chrome.storage.local
      .get("supabase_session")
      .then((data) => {
        const session = data.supabase_session;
        const userAccessToken = session?.access_token || null;

        if (DEBUG)
          console.log(
            "[Background] Retrieved User Access Token present:",
            !!userAccessToken,
          );

        // V2A-06: Check if user is authenticated before making API call
        if (!userAccessToken) {
          console.log(
            "[Background] No user authentication found, prompting for signup",
          );
          // Send authentication required error to content script
          chrome.tabs.sendMessage(tabIdFromSender, {
            type: "ENHANCE_PROMPT_ERROR",
            error:
              "Authentication required. Please sign up to get 25 free credits.",
            authRequired: true, // Flag to trigger auth modal
            targetInputId: targetInputIdFromRequest,
            requestId: request.requestId,
          });
          return;
        }

        // Check if session is expired
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at <= now) {
          console.log(
            "[Background] User session expired, prompting for re-authentication",
          );
          chrome.tabs.sendMessage(tabIdFromSender, {
            type: "ENHANCE_PROMPT_ERROR",
            error: "Session expired. Please log in again.",
            authRequired: true, // Flag to trigger auth modal
            targetInputId: targetInputIdFromRequest,
            requestId: request.requestId,
          });
          return;
        }

        // V2A-05: Call API with valid user JWT
        callOpenAI(
          null,
          systemInstructionForApi,
          userPromptFromRequest,
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

            // V2A-05: Store usage with deviceId for analytics only
            if (response.usage) {
              storeTokenUsageWithDeviceId(response.usage);
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
        console.error("[Background] Error retrieving session:", error);
        chrome.tabs.sendMessage(tabIdFromSender, {
          // Use tabIdFromSender
          type: "ENHANCE_PROMPT_ERROR",
          error: "Failed to retrieve authentication details. Please try again.",
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
    // V2A-02: Handle magic link sending with proper Supabase authentication
    console.log("[Background] Sending magic link for:", request.email);
    
    // Check for recent duplicate requests
    const now = Date.now();
    const lastRequest = recentMagicLinkRequests.get(request.email);
    
    if (lastRequest && (now - lastRequest) < REQUEST_COOLDOWN) {
      console.log("[Background] Duplicate magic link request blocked for:", request.email);
      sendResponse({
        success: false,
        error: "Please wait before requesting another magic link for this email."
      });
      return;
    }
    
    // Record this request
    recentMagicLinkRequests.set(request.email, now);
    
    // Clean up old entries (older than cooldown period)
    for (const [email, timestamp] of recentMagicLinkRequests.entries()) {
      if (now - timestamp > REQUEST_COOLDOWN) {
        recentMagicLinkRequests.delete(email);
      }
    }

    // Send actual magic link via Supabase Auth
    const sendMagicLink = async () => {
      try {
        // Get current extension ID dynamically (works in both dev and production)
        const currentExtensionId = chrome.runtime.id;
        const redirectUrl = `chrome-extension://${currentExtensionId}/options.html`;
        
        console.log("[Background] Using redirect URL:", redirectUrl);
        
        const response = await fetch(SUPABASE_URL + "/auth/v1/magiclink", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            email: request.email,
            options: {
              redirectTo: redirectUrl,
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.msg || "Failed to send magic link");
        }

        console.log("[Background] Magic link sent successfully");
        sendResponse({
          success: true,
          message:
            "✅ Magic link sent! Check your email. If the link doesn't work directly, copy the URL and paste it in a new tab.",
        });
      } catch (error) {
        console.error("[Background] Magic link error:", error);
        sendResponse({
          success: false,
          error:
            error.message || "Failed to send magic link. Please try again.",
        });
      }
    };

    sendMagicLink();
    return true; // Indicates async response
  } else if (request.type === "OPEN_OPTIONS_PAGE") {
    // V2A-02: Open options page
    console.log("[Background] Opening options page");
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
    // No response needed
  }
  // Note: No need to return true for synchronous handlers above
});

// --- Port-based Communication Handler ---
// This handler receives ENHANCE_PROMPT messages sent via chrome.runtime.connect()
// from content/messageHandler.js, enabling service worker persistence and advanced features
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "enhancer") {
    console.log(
      "[Background] Enhancement port connected - service worker staying alive",
    );

    port.onMessage.addListener(async (request) => {
      if (request.type === "ENHANCE_PROMPT") {
        console.log(
          "[Background] Processing ENHANCE_PROMPT via port:",
          request.requestId,
        );

        const userPrompt = request.prompt;
        const contextData = request.conversationContext;
        const systemInstruction = request.systemInstruction;
        const requestId = request.requestId;

        // Format conversation context if available
        const formattedContext = formatConversationContext(contextData);

        // Use provided system instruction, or fallback to MAIN_SYSTEM_INSTRUCTION
        // This enables the sophisticated prompt enhancement with context awareness
        let systemInstructionForApi =
          systemInstruction || MAIN_SYSTEM_INSTRUCTION;

        // Append formatted conversation context to system instruction if available
        if (formattedContext) {
          systemInstructionForApi += `\n\n${formattedContext}`;
        }

        if (!userPrompt) {
          port.postMessage({
            type: "CoPromptErrorResponse",
            error: "Prompt was missing in the request.",
            requestId: requestId,
          });
          return;
        }

        try {
          // Get user authentication (same logic as simple message handler)
          const data = await chrome.storage.local.get("supabase_session");
          const session = data.supabase_session;
          const userAccessToken = session?.access_token || null;

          if (DEBUG) {
            console.log(
              "[Background] Port: User Access Token present:",
              !!userAccessToken,
            );
          }

          if (!userAccessToken) {
            console.log("[Background] Port: No user authentication found");
            port.postMessage({
              type: "CoPromptErrorResponse",
              error:
                "Authentication required. Please sign up to get 25 free credits.",
              authRequired: true,
              requestId: requestId,
            });
            return;
          }

          // Check session expiry
          const now = Math.floor(Date.now() / 1000);
          if (session.expires_at && session.expires_at <= now) {
            console.log("[Background] Port: User session expired");
            port.postMessage({
              type: "CoPromptErrorResponse",
              error: "Session expired. Please log in again.",
              authRequired: true,
              requestId: requestId,
            });
            return;
          }

          // Call OpenAI with the sophisticated system instruction + context
          const response = await callOpenAI(
            null,
            systemInstructionForApi, // ✅ MAIN_SYSTEM_INSTRUCTION with context!
            userPrompt,
            userAccessToken,
          );

          if (DEBUG) {
            console.log(
              "[Background] Port: OpenAI response received for:",
              requestId,
            );
          }

          // Send success response via port
          port.postMessage({
            type: "CoPromptEnhanceResponse",
            enhancedPrompt: response.enhancedPrompt,
            usage: response.usage,
            requestId: requestId,
          });

          // Store analytics (same as simple message handler)
          if (response.usage) {
            storeTokenUsageWithDeviceId(response.usage);
          }
        } catch (error) {
          console.error("[Background] Port: Enhancement error:", error);
          port.postMessage({
            type: "CoPromptErrorResponse",
            error: error.message,
            requestId: requestId,
          });
        }
      }
    });

    port.onDisconnect.addListener(() => {
      console.log(
        "[Background] Enhancement port disconnected - service worker can go dormant",
      );
    });
  }
});

// --- Token usage tracking (V2 analytics) ---
async function storeTokenUsageWithDeviceId(usage) {
  try {
    const timestamp = new Date().toISOString();

    // Get deviceId for analytics tracking
    const deviceId = await getOrCreateDeviceId();

    // Store token usage locally for aggregation (can be sent to analytics later)
    const result = await chrome.storage.local.get("token_usage_log");
    const existingLog = result.token_usage_log || [];

    // Add new usage entry with deviceId for analytics
    existingLog.push({
      timestamp,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      device_id: deviceId, // V2A-05: Include deviceId for analytics only
    });

    // Keep only the last 100 entries to prevent storage bloat
    const trimmedLog = existingLog.slice(-100);

    await chrome.storage.local.set({ token_usage_log: trimmedLog });

    if (DEBUG) {
      console.log("[Background] Token usage stored with device analytics:", {
        usage,
        deviceId,
      });
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

// --- Device ID Management (V2A-05: Analytics-only, not for authentication) ---
async function getOrCreateDeviceId() {
  const result = await chrome.storage.sync.get("coprompt_device_id");
  let deviceId = result.coprompt_device_id;

  if (!deviceId) {
    // Generate a new UUID-like device ID for analytics tracking
    deviceId = crypto.randomUUID
      ? crypto.randomUUID()
      : "device-" +
        Math.random().toString(36).substr(2, 9) +
        "-" +
        Date.now().toString(36);

    await chrome.storage.sync.set({
      coprompt_device_id: deviceId,
      device_created_at: new Date().toISOString(),
    });

    console.log(
      "[Background] Generated new Device ID for analytics:",
      deviceId,
    );
  }
  return deviceId;
}

// Initialize device ID when service worker starts (for analytics)
getOrCreateDeviceId().then((id) => {
  console.log("[Background] Current Device ID for analytics session:", id);
});

// --- Service Worker Lifecycle Listeners ---
chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    `[Background] Extension installed or updated. Reason: ${details.reason}`,
  );
  // Perform any first-time setup or migration tasks here
});

// Handle magic link redirects that get blocked
chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
  if (changeInfo.url && changeInfo.url.includes("supabase.co/auth/v1/verify")) {
    // Extract the redirect_to parameter from the Supabase verification URL
    try {
      const url = new URL(changeInfo.url);
      const redirectTo = url.searchParams.get("redirect_to");

      if (redirectTo && redirectTo.includes("chrome-extension://")) {
        console.log(
          "[Background] Detected blocked magic link redirect, handling manually...",
        );
        // Close the blocked tab and open the extension options page directly
        chrome.tabs.remove(tabId);
        chrome.tabs.create({ url: redirectTo });
      }
    } catch (error) {
      console.log("[Background] Error parsing magic link URL:", error);
    }
  }
});

self.addEventListener("activate", (_event) => {
  console.log("[Background] Service worker activated.");
});

self.addEventListener("install", (_event) => {
  console.log("[Background] Service worker installed.");
});
