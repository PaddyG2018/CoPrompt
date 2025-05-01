import { DEFAULT_SYSTEM_INSTRUCTION } from './utils/constants.js';

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
        sendResponse({ success: false, error: "Failed to secure API key for storage." });
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
        sendResponse({ error: "OpenAI API key not configured. Please set it in the extension options." });
        return;
      }

      try {
        if (DEBUG) console.log("Background: Decrypting API key...");
        const apiKey = await decryptAPIKey(data.openai_api_key);
        if (!apiKey) {
          console.error("Failed to decrypt API key");
          sendResponse({ error: "Invalid API key stored. Please re-enter your API key in options." });
          return;
        }
        if (DEBUG) console.log("Background: API key decrypted successfully");

        // Create a prompt that works with or without context
        let contextAwarePrompt;

        if (hasContext) {
          // Use context if available
          contextAwarePrompt = `
Current conversation context:
${formattedContext}

User's original prompt: "${request.prompt}"

Transform this into a comprehensive, detailed prompt that will get excellent results. Remember to make reasonable assumptions rather than asking questions, and create a complete, ready-to-use prompt.`;
        } else {
          // For fresh chats with no context
          contextAwarePrompt = `
User's original prompt: "${request.prompt}"

This is a fresh conversation with no previous context. Transform this into a comprehensive, detailed prompt that will get excellent results. Remember to make reasonable assumptions rather than asking questions, and create a complete, ready-to-use prompt.`;
        }

        if (DEBUG) console.log("Background: Sending request to OpenAI API...");
        if (DEBUG) console.log("Background: Using model: gpt-4-turbo");

        // --- Outer try...catch for fetch and processing ---
        try {
          const controller = new AbortController();
          let timeoutId = setTimeout(() => {
            controller.abort();
          }, 50000); // 50 second timeout

          const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: "gpt-4.1-mini",
                messages: [
                  { role: "system", content: systemInstruction },
                  { role: "user", content: contextAwarePrompt },
                ],
                temperature: 0.7,
              }),
              signal: controller.signal,
            },
          );

          clearTimeout(timeoutId); // Clear timeout regardless of response status

          if (DEBUG) console.log(`Background: API response status: ${response.status}`);

          // --- Handle Non-OK responses ---
          if (!response.ok) {
            let errorText = "Unknown API error"; // Default error text
            // --- Add try...catch for response.text() ---
            try {
              errorText = await response.text();
              console.error(`API error (${response.status}):`, errorText);
            } catch (parseError) {
              console.error(`API error (${response.status}), but failed to parse error response body:`, parseError);
              errorText = `Status ${response.status}, failed to read error body.`; // Update error text
            }
            // --- End try...catch for response.text() ---

            let userErrorMessage = `API request failed (${errorText}). Check network or API key.`;
            if (response.status === 401) {
                userErrorMessage = "API request failed (Unauthorized). Please check your API key.";
            } else if (response.status === 429) {
                userErrorMessage = "API request failed (Rate Limit/Quota Exceeded). Please check your OpenAI account.";
            }
            sendResponse({ error: userErrorMessage });
            return; // Exit after sending error
          }

          // --- Handle OK responses ---
          // --- Add try...catch for response.json() and processing ---
          try {
            const result = await response.json(); // This might fail if body isn't valid JSON

            if (!result.choices || !result.choices[0]?.message?.content) {
              console.error("Invalid API response structure:", result);
              sendResponse({ error: "Received an invalid response structure from the API." });
              return; // Exit after sending error
            }

            const enhancedPrompt = result.choices[0].message.content;
            const elapsedTime = (Date.now() - startTime) / 1000;
            if (DEBUG) console.log(`Background: Enhancement completed in ${elapsedTime.toFixed(2)} seconds`);
            if (DEBUG) console.log("Background: Enhanced prompt:", enhancedPrompt);

            sendResponse({ enhancedPrompt: enhancedPrompt }); // Send success response

          } catch (jsonError) {
            // Catch errors specifically from response.json() or subsequent processing
            console.error("Failed to parse successful API response as JSON or process result:", jsonError);
            sendResponse({ error: "Failed to process API response. Please try again." });
          }
          // --- End try...catch for response.json() ---

        } catch (fetchError) {
          // Catches network errors, AbortError (timeout), etc.
          console.error("Fetch error:", fetchError);
          let userErrorMessage = "API request failed. Please check your network connection.";
          if (fetchError.name === "AbortError") {
            userErrorMessage = "API request timed out (50s). Please try again.";
          }
          sendResponse({ error: userErrorMessage });
        }
        // --- End outer try...catch for fetch ---

      } catch (error) {
        // Catches errors from key decryption or other setup before fetch
        console.error("Error in enhancement setup phase:", error);
        sendResponse({ error: "An internal error occurred before sending the API request." });
      }
    }); // End chrome.storage.local.get callback

    return true; // Keep message port open for async response
  } // End ENHANCE_PROMPT handler
});
