import { DEFAULT_SYSTEM_INSTRUCTION } from "./utils/constants.js";
import { callOpenAI } from "./background/apiClient.js";
import * as Sentry from '@sentry/browser';

// --- Sentry Initialization ---
Sentry.init({
  dsn: "https://08ddf90527c9cbf204a17dbe010b0f51@o4509259090100224.ingest.us.sentry.io/4509261456474112", // <-- REPLACE THIS with your actual Sentry DSN
  release: chrome.runtime.getManifest().version,
  environment: DEBUG ? 'development' : 'production', // Use DEBUG flag
  integrations: [
    // Default integrations are generally good, but consider removing some if needed
    // new Sentry.BrowserTracing(), // Optional: Add performance tracing later if desired
  ],
  // TracesSampleRate: 1.0, // Optional: Set sampling rate for performance tracing
  
  // Implement opt-in check using async beforeSend
  beforeSend: async (event, hint) => {
    try {
      const data = await chrome.storage.sync.get({ telemetryConsent: false });
      const telemetryEnabled = !!data.telemetryConsent;
      
      if (DEBUG) console.log("[Sentry Debug] beforeSend check: Telemetry Enabled?", telemetryEnabled);
      
      if (!telemetryEnabled) {
        if (DEBUG) console.log("[Sentry Debug] Telemetry disabled, dropping event.");
        return null; // Drop the event if telemetry is not enabled
      }
      
      // TODO: Add data scrubbing here later if necessary
      if (DEBUG) console.log("[Sentry Debug] Telemetry enabled, sending event:", event);
      return event; // Allow the event if telemetry is enabled

    } catch (error) {
       // Log error during storage access, but still drop the event to be safe
       console.error("[Sentry Error] Failed to check telemetry consent in beforeSend:", error);
       return null; 
    }
  },
});

console.log("Sentry Initialized (pending consent check in beforeSend).");

// Simple flag for production builds - Hardcoded to false for stability
const DEBUG = false;

// --- Sentry Error Reporting Helper ---
function reportError(errorCode, error, context = {}) {
  console.error(`[CoPrompt Background Error] Code: ${errorCode}, Error:`, error, "Context:", context); // Keep console log for now
  
  // Basic context enrichment
  const mergedContext = {
    ...context,
    errorCode: errorCode,
    // Add more common context later if needed (e.g., site)
  };

  // Send to Sentry (opt-in check happens in beforeSend)
  if (error instanceof Error) {
      Sentry.captureException(error, { 
          extra: mergedContext,
          tags: { errorCode: errorCode }
      });
  } else {
      // If it's not an Error object, capture as a message with context
      Sentry.captureMessage(`CoPrompt Error: ${errorCode} - ${String(error)}`, {
          level: 'error',
          extra: mergedContext,
          tags: { errorCode: errorCode }
      });
  }
}

// 🔐 Improved API key security using Web Crypto API
async function encryptAPIKey(apiKey) {
  // Use a consistent encryption key derived from browser fingerprint or extension ID
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);

  // Create a key from the extension ID (or another consistent value)
  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(chrome.runtime.id),
  );

  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  // Create a random initialization vector
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the data
  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );

  // Combine IV and encrypted data for storage
  return btoa(
    String.fromCharCode(...iv) +
      String.fromCharCode(...new Uint8Array(encryptedData)),
  );
}

async function decryptAPIKey(encryptedString) {
  try {
    const binaryData = atob(encryptedString);
    const bytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      bytes[i] = binaryData.charCodeAt(i);
    }

    // Extract IV (first 12 bytes)
    const iv = bytes.slice(0, 12);
    const encryptedData = bytes.slice(12);

    // Recreate the key
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(chrome.runtime.id),
    );

    const key = await crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );

    // Decrypt
    const decryptedData = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData,
    );

    return new TextDecoder().decode(decryptedData);
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}

// Helper function to format conversation context
function formatConversationContext(context) {
  if (!context || !Array.isArray(context) || context.length === 0) {
    return "No previous conversation context available.";
  }

  return context
    .map((msg) => {
      return `${msg.role === "assistant" ? "AI" : "User"}: ${msg.content}`;
    })
    .join("\n\n");
}

// --- Listener for Simple One-Time Messages (API Key Mgmt, Error Reporting) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (DEBUG) console.log(`[Background Main Listener] Received ${request.type} request`);

  if (request.type === "SAVE_API_KEY") {
    (async () => {
      try {
        const encryptedKey = await encryptAPIKey(request.apiKey);
        chrome.storage.local.set({ openai_api_key: encryptedKey }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error saving API key:", chrome.runtime.lastError);
            // Send generic error to content script
            sendResponse({
              success: false,
              error: "Failed to save API key to storage.",
            });
          } else {
            if (DEBUG) console.log("API key saved successfully.");
            sendResponse({ success: true });
          }
        });
      } catch (error) {
        console.error("Error encrypting API key:", error);
        // Send generic error to content script
        sendResponse({
          success: false,
          error: "Failed to secure API key for storage.",
        });
      }
    })();
    return true; // Indicate async response
  } else if (request.type === "GET_API_KEY") {
    chrome.storage.local.get("openai_api_key", async (data) => {
      if (chrome.runtime.lastError) {
        console.error("Error retrieving API key:", chrome.runtime.lastError);
        sendResponse({ key: null });
        return;
      }

      if (data.openai_api_key) {
        try {
          const decryptedKey = await decryptAPIKey(data.openai_api_key);
          sendResponse({ key: decryptedKey });
        } catch (error) {
          console.error("Error decrypting API key:", error);
          // Send generic error to content script
          sendResponse({ error: "Error accessing stored API key." });
        }
      } else {
        // Send generic error to content script
        sendResponse({ error: "No API key found in storage." });
      }
    });
    return true; // Indicate async response
  } else if (request.type === "CLEAR_API_KEY") {
    // ... existing CLEAR_API_KEY logic ...
    return true; // Indicate async response
  } else if (request.type === "REPORT_ERROR_FROM_CONTENT") {
      if (DEBUG) console.log("[Background] Received error report from content script:", request.payload);
      const { code, message, stack, context } = request.payload || {};
      // Use the reportError helper function
      reportError(code || 'E_UNKNOWN_CONTENT_SCRIPT', message || 'Unknown error from content script', { 
          stack: stack, 
          context: context, 
          source: 'contentScriptViaInjected' 
      });
      // Send simple acknowledgement back
      sendResponse({ success: true, message: "Error logged." });
      return false; // No async operation here
  } else if (request.type === "TEST_SENTRY") {
      console.log("[Background] Received TEST_SENTRY message.");
      reportError('TEST_ERROR', 'This is a test event to check Sentry opt-in.', { testContext: 'testValue' });
      sendResponse({ success: true, message: "Test error sent to Sentry handler." });
      return false; // Synchronous
  }
  
  // No return true needed for non-async handlers by default
});


// --- Listener for Long-Lived Port Connections (Enhance Prompt) ---
chrome.runtime.onConnect.addListener((port) => {
  if (DEBUG) console.log(`[Background Port Listener] Connection established from: ${port.name}`);

  // Only handle connections named "enhancer"
  if (port.name === "enhancer") {
    
    port.onMessage.addListener(async (message) => {
      if (DEBUG) console.log(`[Background Port Listener] Received message type via port: ${message.type}`);

      if (message.type === "ENHANCE_PROMPT") {
        const { prompt, systemInstruction, conversationContext } = message;
        
        try {
          if (DEBUG) console.log("[Background] Attempting to retrieve API key from storage...");
          const result = await chrome.storage.local.get(["openai_api_key"]);
          if (DEBUG) console.log("[Background] Inside storage.local.get callback for API key.");

          if (!result.openai_api_key) {
            console.error("[Background Error] API key not found.");
            port.postMessage({ error: "API key not set..." });
            return;
          }

          if (DEBUG) console.log("[Background] Attempting to decrypt API key...");
          let apiKey;
          try {
            apiKey = await decryptAPIKey(result.openai_api_key);
            if (DEBUG) console.log("[Background] Decryption function returned.");
          } catch (decryptionError) {
            reportError('E_BACKGROUND_ERROR', decryptionError, { detail: 'Decryption failed' });
            port.postMessage({ error: `Failed to decrypt API key: ${decryptionError.message}` });
            return;
          }

          if (!apiKey) {
            reportError('E_BACKGROUND_ERROR', 'Decryption yielded empty key', { detail: 'Empty decryption result' });
            port.postMessage({ error: "API key decryption failed (empty result)." });
            return;
          }
          if (DEBUG) console.log("[Background] API key decryption appears successful.");

          if (DEBUG) console.log("[Background] Formatting context. Input context length:", conversationContext?.length);
          let formattedContext = "";
          try {
             formattedContext = formatConversationContext(conversationContext || []);
             if (DEBUG) console.log("[Background] Context formatted successfully. Result length:", formattedContext.length);
          } catch (formatError) {
            reportError('E_BACKGROUND_ERROR', formatError, { detail: 'Context formatting failed' });
          }
          
          // Format the final prompt for OpenAI, including context
          const finalSystemInstruction = systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;
          const hasContext = formattedContext && formattedContext !== "No previous conversation context available.";
          let contextAwarePrompt;
          if (hasContext) {
            contextAwarePrompt = `Current conversation context:\n${formattedContext}\n\nUser's original prompt: "${prompt}"\n\nTransform this into a comprehensive, detailed prompt that will get excellent results. Remember to make reasonable assumptions rather than asking questions, and create a complete, ready-to-use prompt.`;
          } else {
            contextAwarePrompt = `User's original prompt: "${prompt}"\n\nThis is a fresh conversation with no previous context. Transform this into a comprehensive, detailed prompt that will get excellent results. Remember to make reasonable assumptions rather than asking questions, and create a complete, ready-to-use prompt.`;
          }

          if (DEBUG) console.log("[Background] Calling callOpenAI...");
          // Pass the correctly formatted prompt to callOpenAI
          const enhancedPrompt = await callOpenAI(apiKey, finalSystemInstruction, contextAwarePrompt);
          if (DEBUG) console.log("[Background] callOpenAI promise resolved. Enhanced prompt snippet:", enhancedPrompt?.substring(0, 100) + '...');

          if (DEBUG) console.log("[Background] Attempting to send response back via port...");
          port.postMessage({ enhancedPrompt: enhancedPrompt });
          if (DEBUG) console.log("[Background] port.postMessage (success path) executed.");

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          reportError('E_BACKGROUND_ERROR', error, { detail: `Enhance prompt handling failed: ${errorMessage}` });
          port.postMessage({ error: `Enhancement failed: ${errorMessage}` }); 
          if (DEBUG) console.log("[Background] port.postMessage (error path) executed.");
        }
      } else {
        reportError('E_UNKNOWN_MESSAGE_TYPE', `Received unknown type: ${message.type}`, { source: 'portListener' });
        console.warn(`[Background Port Listener] Received unknown message type via port: ${message.type}`);
      }
    }); // End of port.onMessage listener

    port.onDisconnect.addListener(() => {
      // Log disconnection, check chrome.runtime.lastError if needed
      if (DEBUG) console.log("[Background Port Listener] Enhancer port disconnected.", chrome.runtime.lastError?.message || '(Normal disconnect)');
      // Clean up resources associated with this port if necessary (none in this case)
    });

  } else {
    console.warn(`[Background Port Listener] Connection from unknown source rejected: ${port.name}`);
    port.disconnect(); // Reject unknown connections
  }
}); // End of chrome.runtime.onConnect listener


// --- Other Service Worker Lifecycle Listeners ---

chrome.runtime.onInstalled.addListener(details => {
  if (DEBUG) console.log(`[Background] Extension installed or updated. Reason: ${details.reason}`);
  // Perform any first-time setup or migration tasks here
});

self.addEventListener('activate', (event) => {
  if (DEBUG) console.log('[Background] Service worker activated.');
  // You might want to claim clients here if needed immediately
  // event.waitUntil(self.clients.claim());
});

self.addEventListener('install', (event) => {
  if (DEBUG) console.log('[Background] Service worker installed.');
  // Perform installation tasks like caching assets if needed
  // event.waitUntil(self.skipWaiting()); // Optional: Force activation
});


console.log("CoPrompt Background Script Loaded (v2 - Sentry Helper Added)");
