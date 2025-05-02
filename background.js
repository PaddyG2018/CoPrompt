import { DEFAULT_SYSTEM_INSTRUCTION } from "./utils/constants.js";
import { callOpenAI } from "./background/apiClient.js";

// Simple flag for production builds - Hardcoded to false for stability
const DEBUG = false;

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

// 🔥 Handle API Key Storage Securely
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Fixed: Removed duplicate handler and improved error handling
  if (request.type === "GET_API_KEY") {
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
    return true; // Keeps the async response channel open
  }

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
    return true;
  }

  if (request.type === "ENHANCE_PROMPT") {
    if (DEBUG) console.log("Background: Enhancing prompt:", request.prompt);

    // Track when the request started
    const startTime = Date.now();

    // Use imported constant as fallback
    const systemInstruction =
      request.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

    // Format conversation context
    const formattedContext = formatConversationContext(
      request.conversationContext,
    );
    const hasContext =
      formattedContext !== "No previous conversation context available.";
    if (DEBUG) console.log("Using conversation context:", formattedContext);

    // 🔐 Securely fetch & decrypt API key
    chrome.storage.local.get("openai_api_key", async (data) => {
      if (!data.openai_api_key) {
        console.error("No OpenAI API key set.");
        sendResponse({
          error:
            "OpenAI API key not configured. Please set it in the extension options.",
        });
        return;
      }

      let apiKey;
      try {
        if (DEBUG) console.log("Background: Decrypting API key...");
        apiKey = await decryptAPIKey(data.openai_api_key);
        if (!apiKey) {
          console.error("Failed to decrypt API key");
          sendResponse({
            error:
              "Invalid API key stored. Please re-enter your API key in options.",
          });
          return;
        }
        if (DEBUG) console.log("Background: API key decrypted successfully");
      } catch (decryptionError) {
        console.error(
          "Error decrypting API key during enhance:",
          decryptionError,
        );
        sendResponse({
          error:
            "Error accessing stored API key. Please try again or re-save your key.",
        });
        return;
      }

      // Create the user prompt (including context)
      let contextAwarePrompt;
      if (hasContext) {
        contextAwarePrompt = `Current conversation context:\n${formattedContext}\n\nUser's original prompt: "${request.prompt}"\n\nTransform this into a comprehensive, detailed prompt that will get excellent results. Remember to make reasonable assumptions rather than asking questions, and create a complete, ready-to-use prompt.`;
      } else {
        contextAwarePrompt = `User's original prompt: "${request.prompt}"\n\nThis is a fresh conversation with no previous context. Transform this into a comprehensive, detailed prompt that will get excellent results. Remember to make reasonable assumptions rather than asking questions, and create a complete, ready-to-use prompt.`;
      }

      if (DEBUG) console.log("Background: Calling apiClient...");

      // --- Call the refactored API client ---
      try {
        const enhancedPrompt = await callOpenAI(
          apiKey,
          systemInstruction,
          contextAwarePrompt,
        );
        if (DEBUG)
          console.log(
            `Background: Enhance successful. Time: ${(Date.now() - startTime) / 1000}s`,
          );
        sendResponse({ enhancedPrompt: enhancedPrompt });
      } catch (apiError) {
        // apiClient throws errors with user-friendly messages
        console.error("Background: Error from apiClient:", apiError.message);
        if (DEBUG)
          console.log(
            `Background: Enhance failed. Time: ${(Date.now() - startTime) / 1000}s`,
          );
        sendResponse({
          error:
            apiError.message || "An unknown error occurred calling the API.",
        });
      }
      // --- End API client call ---
    }); // End storage.local.get callback

    return true; // Keep message channel open for async response
  } // End ENHANCE_PROMPT handler
});
