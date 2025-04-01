// Simple flag for production builds (assuming non-'dev' version is production)
const DEBUG = chrome.runtime.getManifest().version.includes('dev');

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

    // Updated system instruction to create complete, actionable prompts
    const systemInstruction =
      request.systemInstruction ||
      `You are an expert prompt engineer. Your task is to transform basic prompts into comprehensive, detailed prompts that will get excellent results from AI assistants.

IMPORTANT GUIDELINES:
1. DO NOT ask clarifying questions - instead, make reasonable assumptions and include them in the enhanced prompt
2. Create a COMPLETE, READY-TO-USE prompt that can be submitted immediately
3. Add specific details, structure, and parameters that were missing from the original
4. Maintain the original intent but make it more specific and actionable
5. Format the prompt with clear sections, bullet points, or numbered lists when appropriate
6. Include relevant context like target audience, desired format, or specific requirements
7. The output should ONLY be the enhanced prompt, not explanations or meta-commentary

Example transformation:
Original: "help me write a blog post about AI"
Enhanced: "Create a comprehensive blog post about artificial intelligence with the following specifications:
- Target audience: tech professionals with basic AI knowledge
- Include sections on recent advancements, practical applications, and ethical considerations
- Incorporate 2-3 compelling examples or case studies
- Suggest a clear structure with headings and subheadings
- Conclude with forward-looking insights and discussion points"`;

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
        // Send user-friendly error
        sendResponse({ error: "OpenAI API key not configured. Please set it in the extension options." });
        return;
      }

      try {
        if (DEBUG) console.log("Background: Decrypting API key...");
        const apiKey = await decryptAPIKey(data.openai_api_key);
        if (!apiKey) {
          console.error("Failed to decrypt API key");
          // Send user-friendly error - could indicate corruption or bad key
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

        try {
          // Add a timeout for the fetch request using AbortController
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 50000); // 50 second timeout

          const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: "gpt-4-turbo",
                messages: [
                  { role: "system", content: systemInstruction },
                  { role: "user", content: contextAwarePrompt },
                ],
                temperature: 0.7,
              }),
              signal: controller.signal,
            },
          );

          // Clear the timeout since we got a response
          clearTimeout(timeoutId);

          if (DEBUG) console.log(`Background: API response status: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text(); // Keep for internal log
            console.error(`API error (${response.status}):`, errorText);
            // Send generic error, potentially hinting at key/quota issue
            let userErrorMessage = "API request failed. Please check your network connection.";
            if (response.status === 401) { // Unauthorized
                userErrorMessage = "API request failed (Unauthorized). Please check your API key.";
            } else if (response.status === 429) { // Rate limit / Quota
                userErrorMessage = "API request failed (Rate Limit/Quota Exceeded). Please check your OpenAI account.";
            }
            sendResponse({ error: userErrorMessage });
            // No need to throw here if we sent response
            return;
          }

          const result = await response.json();
          if (!result.choices || !result.choices[0]?.message?.content) {
            console.error("Invalid API response structure:", result);
            // Send generic error
            sendResponse({ error: "Received an invalid response from the API." });
            return;
          }

          const enhancedPrompt = result.choices[0].message.content;
          const elapsedTime = (Date.now() - startTime) / 1000;
          if (DEBUG) console.log(
            `Background: Enhancement completed in ${elapsedTime.toFixed(2)} seconds`,
          );
          if (DEBUG) console.log("Background: Enhanced prompt:", enhancedPrompt);

          sendResponse({ enhancedPrompt: enhancedPrompt });
        } catch (fetchError) {
          console.error("Fetch error:", fetchError);
          let userErrorMessage = "API request failed. Please check your network connection.";
          // Provide more specific error messages based on the error type
          if (fetchError.name === "AbortError") {
            userErrorMessage = "API request timed out (50s). Please try again.";
          }
          // Send generic error based on fetch error type
          sendResponse({ error: userErrorMessage });
        }
      } catch (error) {
        console.error("Error in enhancement process:", error); // Catch errors during key decryption etc.
        // Send generic internal error
        sendResponse({ error: "An internal error occurred during prompt enhancement." });
      }
    });

    return true; // ✅ Keeps the message channel open for async response
  }
});
