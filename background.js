import { DEFAULT_SYSTEM_INSTRUCTION } from "./utils/constants.js";
import { callOpenAI } from "./background/apiClient.js";

// --- Simplified Error Reporting Helper ---
function reportError(errorCode, error, context = {}) {
  // Simple console logging for errors
  console.error(`[CoPrompt Background Error] Code: ${errorCode}, Error:`, error, "Context:", context);
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
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
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

  } else if (request.type === "GET_API_KEY") {
    // This handler uses sendResponse asynchronously via callback
    chrome.storage.local.get("openai_api_key", async (data) => {
        if (chrome.runtime.lastError) {
           console.error("Error getting API key:", chrome.runtime.lastError);
           sendResponse({ apiKey: null, error: chrome.runtime.lastError.message });
        } else if (data.openai_api_key) {
           try {
              // const decryptedKey = await decryptAPIKey(data.openai_api_key);
              // sendResponse({ apiKey: decryptedKey }); 
              sendResponse({ apiKey: data.openai_api_key /* Send raw for now */ });
           } catch (error) {
              console.error("Decryption error:", error);
              sendResponse({ apiKey: null, error: "Decryption failed" });
           }
        } else {
            sendResponse({ apiKey: null }); // No key found
        }
    });
    return true; // Indicate async response

  } else if (request.type === "CLEAR_API_KEY") {
     // This handler uses sendResponse asynchronously 
     chrome.storage.local.remove("openai_api_key", () => {
        if (chrome.runtime.lastError) {
           console.error("Error clearing API key:", chrome.runtime.lastError);
           sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
           console.log("API Key cleared successfully.");
           sendResponse({ success: true });
        }
     });
     return true; // Indicate async response

  } else if (request.type === "REPORT_ERROR_FROM_CONTENT") {
      // Synchronous handler now, just calls the simplified reportError
      console.log("[Background] Received error report from content script:", request.payload);
      const { code, message, stack, context } = request.payload || {};
      reportError(code || 'E_UNKNOWN_CONTENT_SCRIPT', message || 'Unknown error from content script', { 
          stack: stack, 
          context: context, 
          source: 'contentScriptViaInjected' 
      });
      // No response needed/sent
      // Return false or nothing (default for sync handlers)

  } 
  // Removed TEST_SENTRY handler
  
  // Default return for synchronous handlers (or handlers not using sendResponse)
  return false; 
});

// --- Listener for Long-Lived Port Connections ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "enhancer") {
    console.log("[Background Port Listener] Enhancer port connected.");

    port.onMessage.addListener(async (message) => { // Keep this async due to callOpenAI
      if (message.type === "ENHANCE_PROMPT") {
         try {
            // 1. Retrieve the stored API key
            const storageData = await chrome.storage.local.get("openai_api_key");
            const encryptedKey = storageData.openai_api_key;

            if (!encryptedKey) {
                reportError('E_API_KEY_MISSING', 'API key not found in storage.', { source: 'portListener' });
                port.postMessage({ type: "CoPromptErrorResponse", error: "API key not set. Please set it in the extension options." });
                return; // Stop processing if key is missing
            }

            // 2. Decrypt the API key
            let apiKey = null;
            try {
                apiKey = await decryptAPIKey(encryptedKey);
            } catch (decryptionError) {
                reportError('E_DECRYPTION_FAILED', decryptionError, { source: 'portListener' });
                port.postMessage({ type: "CoPromptErrorResponse", error: "Failed to decrypt API key." });
                return; // Stop processing if decryption fails
            }
            
            if (!apiKey) {
                 reportError('E_DECRYPTION_EMPTY', 'Decryption resulted in null/empty key.', { source: 'portListener' });
                 port.postMessage({ type: "CoPromptErrorResponse", error: "API key decryption failed (empty result)." });
                 return; // Stop processing if key is empty after decryption
            }
            
            // 3. Format context (if needed, example assumes it's passed in message)
            const formattedContext = formatConversationContext(message.context || []);
            const systemInstruction = message.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

            // 4. Call OpenAI with the decrypted key and context
            const result = await callOpenAI(apiKey, systemInstruction, message.prompt, formattedContext);
            port.postMessage({ type: "CoPromptEnhanceResponse", data: result });

         } catch (error) {
            // Catch errors from callOpenAI or other issues
            reportError('E_BACKGROUND_ERROR', error, { prompt: message.prompt, context: message.context });
            port.postMessage({ type: "CoPromptErrorResponse", error: error.message || "Unknown background error" });
         }
      } else {
        // Use the simplified, synchronous reportError
        reportError('E_UNKNOWN_MESSAGE_TYPE', `Received unknown message type via port: ${message.type}`, { source: 'portListener' });
        // ... (rest of port listener)
      }
    });
    // ... (port.onDisconnect) ...
  }
  // ... (rest of onConnect) ...
});

// --- Other Service Worker Lifecycle Listeners ---

chrome.runtime.onInstalled.addListener(details => {
  console.log(`[Background] Extension installed or updated. Reason: ${details.reason}`);
  // Perform any first-time setup or migration tasks here
});

self.addEventListener('activate', (event) => {
  console.log('[Background] Service worker activated.');
  // You might want to claim clients here if needed immediately
  // event.waitUntil(self.clients.claim());
});

self.addEventListener('install', (event) => {
  console.log('[Background] Service worker installed.');
  // Perform installation tasks like caching assets if needed
  // event.waitUntil(self.skipWaiting()); // Optional: Force activation
});

console.log("CoPrompt Background Script Loaded (v2 - Sentry Helper Added)");
