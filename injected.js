import {
  DEFAULT_SYSTEM_INSTRUCTION,
  CODE_SYSTEM_INSTRUCTION,
  RESEARCH_SYSTEM_INSTRUCTION,
  CREATIVE_SYSTEM_INSTRUCTION
} from './utils/constants.js';

// Simple flag - injected scripts don't have easy access to manifest
// Assume production logging unless specifically enabled for debug builds
const DEBUG = false; 

if (DEBUG) console.log("CoPrompt injected.js loaded successfully");

// Modified to use message passing instead of direct API calls
async function determinePromptCategory(prompt) {
  // Simple regex patterns for initial categorization
  const codePatterns =
    /\bcode\b|\bfunction\b|\bclass\b|\bprogramming\b|\bjavascript\b|\bpython\b|\bc\+\+\b|\bjava\b|\bhtml\b|\bcss\b|\bsql\b/i;
  const researchPatterns =
    /\bresearch\b|\bstudy\b|\banalysis\b|\bdata\b|\bscientific\b|\bhistory\b|\bexplain\b|\btheory\b/i;
  const creativePatterns =
    /\bstory\b|\bcreative\b|\bwrite\b|\bpoem\b|\bnarrative\b|\bfiction\b|\bimagine\b|\bscenario\b/i;

  // Try regex first for efficiency
  if (codePatterns.test(prompt)) return "code";
  if (researchPatterns.test(prompt)) return "research";
  if (creativePatterns.test(prompt)) return "creative";

  // No AI fallback - just use general category to avoid CSP issues
  return "general";
}

// ✅ Improved API key retrieval with timeout
async function getAPIKeyFromContentScript() {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.error("API key request timed out");
      resolve(null);
    }, 5000);

    const handleMessage = (event) => {
      if (
        event.source !== window ||
        event.data.type !== "CoPromptAPIKeyResponse"
      )
        return;

      // Clean up
      clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);

      if (event.data.key) {
        resolve(event.data.key);
      } else {
        console.error("No API key received from content script.");
        resolve(null);
      }
    };

    window.addEventListener("message", handleMessage);
    window.postMessage({ type: "CoPromptGetAPIKey" }, "*");
  });
}

// Modified to use message passing for API calls
window.enhancePrompt = async function (prompt) {
  if (DEBUG) console.log("Sending prompt to AI for enhancement:", prompt);

  try {
    // Get API key through content.js
    const apiKey = await getAPIKeyFromContentScript();
    if (!apiKey) {
      console.error("No API key found.");
      return prompt; // Fallback to original prompt
    }

    // Detect category using regex only (no API call)
    const category = await determinePromptCategory(prompt);
    if (DEBUG) console.log("Detected category:", category);

    // Define tailored instructions based on category
    let systemInstruction = DEFAULT_SYSTEM_INSTRUCTION;

    if (category === "code") {
      systemInstruction = CODE_SYSTEM_INSTRUCTION;
    } else if (category === "research") {
      systemInstruction = RESEARCH_SYSTEM_INSTRUCTION;
    } else if (category === "creative") {
      systemInstruction = CREATIVE_SYSTEM_INSTRUCTION;
    }

    // Send request to background script via content script
    return new Promise((resolve) => {
      // Increase timeout to 60 seconds (from 30)
      const timeoutId = setTimeout(() => {
        console.error("Enhance prompt request timed out after 60 seconds");
        resolve(prompt); // Return original prompt on timeout
      }, 60000);

      // Track if we've received a response
      let responseReceived = false;

      // Track when the request was sent
      const requestStartTime = Date.now();
      if (DEBUG) console.log("Sending enhancement request at:", new Date().toISOString());

      const handleEnhanceResponse = (event) => {
        if (
          event.source !== window ||
          event.data.type !== "CoPromptEnhanceResponse"
        )
          return;

        // Calculate response time
        const responseTime = (Date.now() - requestStartTime) / 1000;
        if (DEBUG) console.log(
          `Received enhancement response after ${responseTime.toFixed(2)} seconds`,
        );

        // Mark that we've received a response
        responseReceived = true;

        // Clean up
        clearTimeout(timeoutId);
        window.removeEventListener("message", handleEnhanceResponse);

        if (event.data.error) {
          console.error("Error enhancing prompt:", event.data.error);
          resolve(prompt); // Return original on error
        } else {
          if (DEBUG) console.log("AI-enhanced prompt received from background script");

          // Verify we got a meaningful enhancement
          const enhancedPrompt = event.data.enhancedPrompt || prompt;

          // If the enhanced prompt is the same as the original or very short, return the original
          if (
            enhancedPrompt === prompt ||
            enhancedPrompt.length < prompt.length
          ) {
            console.warn(
              "Enhanced prompt was not meaningful, returning original",
            );
            resolve(prompt);
          } else {
            resolve(enhancedPrompt);
          }
        }
      };

      window.addEventListener("message", handleEnhanceResponse);

      // Send request to content script
      window.postMessage(
        {
          type: "CoPromptEnhanceRequest",
          prompt: prompt,
          systemInstruction: systemInstruction,
        },
        "*",
      );

      // Add more frequent status checks
      const checkInterval = setInterval(() => {
        if (responseReceived) {
          clearInterval(checkInterval);
          return;
        }

        const waitTime = (Date.now() - requestStartTime) / 1000;
        if (DEBUG) console.log(
          `Still waiting for enhancement response after ${waitTime.toFixed(0)} seconds...`,
        );

        // After 30 seconds, warn the user that it's taking longer than expected
        if (waitTime > 30 && waitTime < 31) {
          console.warn(
            "Enhancement request is taking longer than expected. This might be due to high API traffic or a slow connection.",
          );
        }
      }, 10000); // Check every 10 seconds
    });
  } catch (error) {
    console.error("Error in enhancePrompt:", error);
    return prompt; // Fallback: return original prompt if anything fails
  }
};

// ✅ Fix: Ensure `postMessage()` correctly waits for the AI-enhanced prompt
window.addEventListener("message", async (event) => {
  if (event.source !== window || event.data.type !== "CoPromptEnhance") return;

  if (DEBUG) console.log("Received prompt enhancement request:", event.data.prompt);

  const originalPrompt = event.data.prompt;
  const callbackId = event.data.callbackId;

  if (!originalPrompt || !callbackId) {
    console.error("Missing prompt or callbackId in CoPromptEnhance message");
    return;
  }

  // Perform the enhancement
  try {
    const improvedPrompt = await window.enhancePrompt(originalPrompt);
    if (DEBUG) console.log("Enhanced prompt:", improvedPrompt);

    // Add a small delay to ensure the message is processed correctly
    setTimeout(() => {
      if (DEBUG) console.log("Sending enhanced prompt back to content.js");
      window.postMessage(
        {
          type: "CoPromptEnhanceResponse",
          enhancedPrompt: improvedPrompt,
          callbackId: callbackId,
        },
        "*",
      );
    }, 100);
  } catch (error) {
    console.error("Error in prompt enhancement process:", error);
    window.postMessage(
      {
        type: "CoPromptEnhanceResponse",
        error: `Enhancement failed: ${error.message}`,
        callbackId: callbackId,
      },
      "*",
    );
  }
});
