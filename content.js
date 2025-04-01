// REMOVED import { createLogger } from './utils/logger.js';

// REMOVED const logger = createLogger('content');

// Re-add simple DEBUG flag (assuming background.js check is sufficient)
// We might need a way to get this from background if not in manifest
const DEBUG = false; // Set to false for production manually for now

// Add at the top of the file with other global variables
const DRAG_THRESHOLD = 5; // pixels
const CLICK_DELAY = 100; // milliseconds

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragDistance = 0;
let isButtonDragging = false;
let dragStartTime = 0;
let lastDragEndTime = -CLICK_DELAY; // Initialize to a value that won't trigger the delay check
let hasDragged = false; // New flag to track if actual dragging occurred

// Inject `injected.js` into the page properly
const script = document.createElement("script");
script.src = chrome.runtime.getURL("injected.js");
script.onload = function () {
  this.remove();
}; // Remove once loaded
(document.head || document.documentElement).appendChild(script);

// Debounce function to prevent rapid-fire executions
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Track if we've already injected the button
let buttonInjected = false;

// Re-add simple debugLog function (or use DEBUG directly)
function debugLog(message, obj = null) {
  if (DEBUG) {
    const prefix = "[CoPrompt Debug]";
    if (obj) {
      console.log(prefix, message, obj);
    } else {
      console.log(prefix, message);
    }
  }
}

// Force button visibility check and repair
function checkButtonVisibility() {
  const button = document.getElementById("coprompt-button");
  if (!button) {
    debugLog("Button not found in DOM"); // Use restored debugLog
    buttonInjected = false;
    return false;
  }

  const rect = button.getBoundingClientRect();
  debugLog("Button dimensions:", { // Use restored debugLog
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    visible: rect.width > 0 && rect.height > 0,
  });

  // Check if button is actually visible
  const style = window.getComputedStyle(button);
  debugLog("Button computed style:", { // Use restored debugLog
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    zIndex: style.zIndex,
  });

  // If button exists but isn't visible, try to fix it
  if (
    rect.width === 0 ||
    rect.height === 0 ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    console.log("Button exists but is not visible, attempting to fix..."); // Reverted to console.log (info level)

    // Apply stronger styling
    button.style.display = "flex !important";
    button.style.visibility = "visible !important";
    button.style.opacity = "1 !important";
    button.style.zIndex = "9999 !important";
    button.style.position = "relative";
    button.style.backgroundColor = "#0070F3"; // Updated to blue
    button.style.color = "white";
    button.style.fontWeight = "bold";
    button.style.padding = "10px 15px";
    button.style.margin = "0 10px";
    button.style.boxShadow = "0 0 10px rgba(0, 112, 243, 0.7)"; // Updated shadow color

    return false;
  }

  return true;
}

const getChatGPTInputField = () => {
  // Only search for the input if we haven't injected the button yet
  if (buttonInjected && checkButtonVisibility()) return null;

  // Try multiple strategies to find the input field
  const strategies = [
    // Strategy 1: New ChatGPT contenteditable div
    () =>
      document.querySelector(
        "div.ProseMirror[contenteditable='true']#prompt-textarea",
      ),
    // Strategy 2: Any contenteditable with prompt-textarea ID
    () => document.querySelector("#prompt-textarea[contenteditable='true']"),
    // Strategy 3: Legacy textarea
    () => document.querySelector("textarea:not([style*='display: none'])"),
  ];

  for (const strategy of strategies) {
    const element = strategy();
    if (element && element.offsetParent !== null) {
      debugLog("Found input field using strategy:", strategy.toString()); // Use restored debugLog
      return element;
    }
  }

  return null;
};

// Function to extract conversation context
function getConversationContext() {
  // Get conversation elements from the page
  const conversationElements = document.querySelectorAll(
    "[data-message-author-role]",
  );

  // Extract the last few messages (up to 6)
  const contextLimit = 6;
  const recentMessages = [];

  // Process messages from newest to oldest
  for (
    let i = conversationElements.length - 1;
    i >= 0 && recentMessages.length < contextLimit;
    i--
  ) {
    const element = conversationElements[i];
    const role = element.getAttribute("data-message-author-role");

    recentMessages.unshift({
      role: role === "assistant" ? "assistant" : "user",
      content: element.textContent.trim(),
    });
  }

  return recentMessages;
}

// Update the handleEnhanceClick function
function handleEnhanceClick(inputElement) {
  debugLog("handleEnhanceClick called with element:", inputElement); // Use restored debugLog
  
  // Get text from input element using multiple approaches
  let originalPrompt = "";

  // For contenteditable divs
  if (inputElement.getAttribute("contenteditable") === "true") {
    debugLog("Handling contenteditable element"); // Use restored debugLog
    // Try innerText first
    originalPrompt = inputElement.innerText || inputElement.textContent;
    debugLog("Initial prompt from innerText:", originalPrompt); // Use restored debugLog

    // If that fails, try getting text from child nodes
    if (!originalPrompt) {
      debugLog("No text found, trying child nodes"); // Use restored debugLog
      const textNodes = [];
      const walker = document.createTreeWalker(
        inputElement,
        NodeFilter.SHOW_TEXT,
      );
      let node;
      while ((node = walker.nextNode())) {
        textNodes.push(node.nodeValue);
      }
      originalPrompt = textNodes.join(" ");
      debugLog("Prompt from child nodes:", originalPrompt); // Use restored debugLog
    }
  }
  // For textareas
  else if (inputElement.tagName === "TEXTAREA") {
    debugLog("Handling textarea element"); // Use restored debugLog
    originalPrompt = inputElement.value;
    debugLog("Prompt from textarea:", originalPrompt); // Use restored debugLog
  }
  // Fallback
  else {
    debugLog("Using fallback text extraction"); // Use restored debugLog
    originalPrompt =
      inputElement.textContent ||
      inputElement.innerText ||
      inputElement.value ||
      "";
    debugLog("Prompt from fallback:", originalPrompt); // Use restored debugLog
  }

  if (!originalPrompt) {
    console.warn("No prompt text found in input element"); // Reverted to console.warn
    return;
  }

  console.log("Sending enhance request with prompt:", originalPrompt); // Reverted to console.log (info level)

  // Visual feedback with animation
  const button = document.querySelector("#coprompt-button");
  if (button) {
    debugLog("Updating button with loading animation"); // Use restored debugLog
    // Create and add the loading animation
    button.innerHTML = "";

    // Add the dots container
    const dotsContainer = document.createElement("div");
    dotsContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            margin-right: 8px;
        `;

    // Create the three dots
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("div");
      dot.style.cssText = `
                width: 4px;
                height: 4px;
                background-color: white;
                border-radius: 50%;
                opacity: 0.7;
                animation: copromptDotPulse 1.4s infinite ease-in-out;
                animation-delay: ${i * 0.2}s;
            `;
      dotsContainer.appendChild(dot);
    }

    // Add the text
    const textSpan = document.createElement("span");
    textSpan.textContent = "Enhancing";

    // Add the animation keyframes to the document if they don't exist
    if (!document.getElementById("coprompt-animations")) {
      const style = document.createElement("style");
      style.id = "coprompt-animations";
      style.textContent = `
                @keyframes copromptDotPulse {
                    0%, 80%, 100% { transform: scale(0.8); opacity: 0.7; }
                    40% { transform: scale(1.2); opacity: 1; }
                }
            `;
      document.head.appendChild(style);
    }

    button.appendChild(dotsContainer);
    button.appendChild(textSpan);
    button.style.opacity = "0.9";
  }

  // Send the enhance request to the background script
  window.postMessage(
    {
      type: "CoPromptEnhanceRequest",
      prompt: originalPrompt,
      systemInstruction: `You are an expert prompt engineer. Your task is to transform basic prompts into comprehensive, detailed prompts that will get excellent results from AI assistants.

IMPORTANT GUIDELINES:
1. DO NOT ask clarifying questions - instead, make reasonable assumptions and include them in the enhanced prompt
2. Create a COMPLETE, READY-TO-USE prompt that can be submitted immediately
3. Add specific details, structure, and parameters that were missing from the original
4. Maintain the original intent but make it more specific and actionable
5. Format the prompt with clear sections, bullet points, or numbered lists when appropriate
6. Include relevant context like target audience, desired format, or specific requirements
7. The output should ONLY be the enhanced prompt, not explanations or meta-commentary`,
    },
    "*",
  );
  console.log("Sent CoPromptEnhanceRequest message"); // Reverted to console.log (info level)
}

// Consolidate all message event listeners into one
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  console.log("Received message:", event.data.type); // Reverted to console.log (info level)

  // Handle API key request
  if (event.data.type === "CoPromptGetAPIKey") {
    console.log("Handling API key request"); // Reverted to console.log (info level)
    chrome.runtime.sendMessage({ type: "GET_API_KEY" }, (response) => {
      if (response?.key) {
        console.log("Got API key, sending response"); // Reverted to console.log (info level)
        window.postMessage(
          { type: "CoPromptAPIKeyResponse", key: response.key },
          "*",
        );
      } else {
        console.error("API key retrieval failed in content.js"); // Reverted to console.error
        window.postMessage({ type: "CoPromptAPIKeyResponse", key: null }, "*");
      }
    });
  }

  // Handle enhance prompt request
  if (event.data.type === "CoPromptEnhanceRequest") {
    console.log(
      "Content script: Relaying prompt enhancement request to background script",
      event.data
    ); // Reverted to console.log (info level)

    // Get conversation context
    const conversationContext = getConversationContext();
    console.log("Conversation context:", conversationContext); // Reverted to console.log (info level)

    // Track when the request was sent
    const requestStartTime = Date.now();
    console.log(
      "Content script: Sending request to background script at",
      new Date().toISOString(),
    ); // Reverted to console.log (info level)

    // Set up a timeout for the background script response
    const timeoutId = setTimeout(() => {
      console.error(
        "Content script: Background script response timed out after 55 seconds",
      ); // Reverted to console.error
      window.postMessage(
        {
          type: "CoPromptEnhanceResponse",
          error:
            "Background script response timed out (55s). Please try again or check your API key.",
        },
        "*",
      );
    }, 55000);

    chrome.runtime.sendMessage(
      {
        type: "ENHANCE_PROMPT",
        prompt: event.data.prompt,
        systemInstruction: event.data.systemInstruction,
        conversationContext: conversationContext,
      },
      (response) => {
        console.log("Received response from background script:", response); // Reverted to console.log (info level)
        // Clear the timeout since we got a response
        clearTimeout(timeoutId);

        // Calculate how long the request took
        const requestTime = (Date.now() - requestStartTime) / 1000;
        console.log(
          `Content script: Received response from background script after ${requestTime.toFixed(2)} seconds`,
        ); // Reverted to console.log (info level)

        if (!response) {
          console.error(
            "Content script: No response received from background script (possible timeout)",
          ); // Reverted to console.error
          window.postMessage(
            {
              type: "CoPromptEnhanceResponse",
              error: "No response from background script (possible timeout)",
            },
            "*",
          );
          return;
        }

        if (response?.error) {
          console.error(
            "Content script: Error from background script:",
            response.error,
          ); // Reverted to console.error
          window.postMessage(
            {
              type: "CoPromptEnhanceResponse",
              error: response.error,
            },
            "*",
          );
        } else if (response?.enhancedPrompt) {
          console.log(
            "Content script: Received enhanced prompt from background",
          ); // Reverted to console.log (info level)
          window.postMessage(
            {
              type: "CoPromptEnhanceResponse",
              enhancedPrompt: response.enhancedPrompt,
            },
            "*",
          );
        } else {
          console.error(
            "Content script: Invalid response from background script",
            response,
          ); // Reverted to console.error
          window.postMessage(
            {
              type: "CoPromptEnhanceResponse",
              error: "Invalid response from background script",
            },
            "*",
          );
        }
      },
    );
  }

  // Handle enhanced prompt response
  if (event.data.type === "CoPromptEnhanceResponse") {
    console.log("Received enhanced prompt response:", event.data); // Reverted to console.log (info level)
    const button = document.querySelector("#coprompt-button");
    if (button) {
      // Update with icon + text
      button.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles" style="margin-right: 6px;">
                    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
                    <path d="M20 3v4"></path>
                    <path d="M22 5h-4"></path>
                    <path d="M4 17v2"></path>
                    <path d="M5 18H3"></path>
                </svg>
                Improve Prompt
            `;
      button.style.opacity = "0.9";
    }

    // Get the improved prompt from the event data
    const improvedPrompt = event.data.enhancedPrompt;
    if (!improvedPrompt) {
      console.log("No improved prompt received"); // Reverted to console.log (info level)
      return;
    }

    console.log("Received enhanced prompt, updating input field"); // Reverted to console.log (info level)

    // Find the input field using multiple strategies
    let inputField = null;

    // Strategy 1: Direct ID selector for contenteditable
    inputField = document.querySelector(
      "#prompt-textarea[contenteditable='true']",
    );

    // Strategy 2: Direct ID selector for textarea
    if (!inputField) {
      inputField = document.querySelector("textarea#prompt-textarea");
    }

    // Strategy 3: Look for ProseMirror contenteditable
    if (!inputField) {
      inputField = document.querySelector(
        "div.ProseMirror[contenteditable='true']",
      );
    }

    // Strategy 4: Any visible textarea
    if (!inputField) {
      const textareas = document.querySelectorAll("textarea");
      for (const textarea of textareas) {
        if (textarea.offsetParent !== null) {
          inputField = textarea;
          break;
        }
      }
    }

    // Strategy 5: Any contenteditable div
    if (!inputField) {
      const contenteditables = document.querySelectorAll(
        "div[contenteditable='true']",
      );
      for (const div of contenteditables) {
        if (div.offsetParent !== null) {
          inputField = div;
          break;
        }
      }
    }

    // Strategy 6: Look for the form and find the input within it
    if (!inputField) {
      const form = document.querySelector("form");
      if (form) {
        const formInput = form.querySelector(
          "[contenteditable='true'], textarea",
        );
        if (formInput) {
          inputField = formInput;
        }
      }
    }

    if (!inputField) {
      console.log("Could not find input field to update with enhanced prompt"); // Reverted to console.log (info level)
      alert(
        "Could not find the input field to update. The enhanced prompt has been copied to your clipboard.",
      );

      // Copy to clipboard as a fallback
      navigator.clipboard.writeText(improvedPrompt).catch((e) => {
        console.error("Failed to copy to clipboard:", e);
      });
      return;
    }

    // Update the input field with the enhanced prompt
    try {
      // For contenteditable divs (new ChatGPT interface)
      if (inputField.getAttribute("contenteditable") === "true") {
        console.log("Updating contenteditable input field"); // Reverted to console.log (info level)

        // Try multiple approaches to update the contenteditable
        try {
          // Best approach: Simulate user input event
          inputField.focus();
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, improvedPrompt);
        } catch (error1) {
          console.error("Error updating contenteditable with execCommand:", error1); // Reverted
          try {
            // Fallback 1: Set innerText
            inputField.innerText = improvedPrompt;
            // Trigger input event manually
            const inputEvent = new Event("input", { bubbles: true });
            inputField.dispatchEvent(inputEvent);
          } catch (error2) {
            console.error("Error updating contenteditable with innerText:", error2); // Reverted
          }
        }
      }
      // For regular textareas (legacy interface)
      else if (inputField.tagName === "TEXTAREA") {
        console.log("Updating textarea input field"); // Reverted to console.log (info level)
        inputField.value = improvedPrompt;
        inputField.dispatchEvent(new Event("input", { bubbles: true }));
        inputField.dispatchEvent(new Event("change", { bubbles: true }));
        inputField.focus();
        console.log("Successfully updated textarea input field"); // Reverted to console.log (info level)
      } else {
        console.log("Unknown input field type:", inputField.tagName); // Reverted
      }
    } catch (error) {
      console.error("Error updating input field with enhanced prompt:", error); // Reverted

      // Copy to clipboard as a fallback
      navigator.clipboard.writeText(improvedPrompt).catch((e) => {
        console.error("Failed to copy to clipboard:", e); // Reverted
      });
      alert(
        "Could not update the input field. The enhanced prompt has been copied to your clipboard.",
      );
    }
  }
});

// Debounced observer callback
const debouncedObserverCallback = debounce((mutations) => {
  if (buttonInjected && checkButtonVisibility()) return;

  const inputField = getChatGPTInputField();
  if (inputField) {
    injectButton(inputField);
  }
}, 100);

// Initialize observer only once
if (!window.coPromptObserver) {
  window.coPromptObserver = new MutationObserver(debouncedObserverCallback);

  // Observe only necessary parts of the DOM
  const observerTarget = document.querySelector("main") || document.body;
  window.coPromptObserver.observe(observerTarget, {
    childList: true,
    subtree: true,
    attributes: false, // Reduce unnecessary triggers
  });
}

// Initial injection attempt
setTimeout(() => {
  // Prefer floating button
  createFloatingButton();
}, 1000); // Wait for page to fully load

// Periodic check to ensure button remains visible
setInterval(() => {
  const existingButton = document.getElementById("coprompt-button");
  const container = document.getElementById("coprompt-container");

  if (!existingButton || !container) {
    debugLog("Button not found, recreating");
    buttonInjected = false;
    createFloatingButton();
    return;
  }

  // Check if button is visible
  const rect = existingButton.getBoundingClientRect();
  const style = window.getComputedStyle(existingButton);

  if (
    rect.width === 0 ||
    rect.height === 0 ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0" ||
    parseFloat(style.opacity) < 0.1
  ) {
    debugLog("Button exists but is not visible, forcing visibility");

    // Force visibility with !important flags
    container.style.cssText += `
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            z-index: 99999 !important;
            position: fixed !important;
        `;

    existingButton.style.cssText += `
            display: flex !important;
            visibility: visible !important;
            opacity: 0.9 !important;
            z-index: 99999 !important;
            background: #0070F3 !important;
            box-shadow: 0 2px 8px rgba(0, 112, 243, 0.3) !important;
        `;

    // If button is outside viewport, reset position
    if (
      rect.top < 0 ||
      rect.left < 0 ||
      rect.top > window.innerHeight ||
      rect.left > window.innerWidth
    ) {
      debugLog("Button outside viewport, resetting position");
      container.style.top = "auto";
      container.style.left = "auto";
      container.style.bottom = "80px"; // Position higher to avoid input box
      container.style.right = "20px";

      // Clear saved position
      localStorage.removeItem("coPromptButtonPosition");
    }
  }
}, 5000); // Check every 5 seconds

// Update the makeDraggable function
function makeDraggable(element) {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;
  let startX = 0,
    startY = 0;

  // Get the button inside the container
  const button = element.querySelector("#coprompt-button");
  if (!button) return;

  // Handle mouse events
  element.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();

    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    startX = e.clientX;
    startY = e.clientY;
    dragStartTime = Date.now();
    hasDragged = false; // Reset drag flag

    // Set dragging state
    isButtonDragging = true;
    dragDistance = 0;

    // Add dragging class for visual feedback
    element.classList.add("coprompt-dragging");
    if (button) button.style.cursor = "grabbing";

    // Set up event listeners for drag and end
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    if (!isButtonDragging) return;

    e.preventDefault();
    e.stopPropagation();

    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    // Calculate total drag distance
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    dragDistance = Math.sqrt(dx * dx + dy * dy);

    // Set hasDragged flag if we've moved beyond the threshold
    if (dragDistance > DRAG_THRESHOLD) {
        hasDragged = true;
    }

    // Set the element's new position
    const newTop = element.offsetTop - pos2;
    const newLeft = element.offsetLeft - pos1;

    // Ensure the button stays within the viewport
    if (newTop > 0 && newTop < window.innerHeight - 50) {
        element.style.top = newTop + "px";
    }

    if (newLeft > 0 && newLeft < window.innerWidth - 50) {
        element.style.left = newLeft + "px";
    }

    // When using top/left, we need to set bottom/right to auto
    element.style.bottom = "auto";
    element.style.right = "auto";
  }

  function closeDragElement() {
    // Stop moving when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;

    // Remove dragging class
    element.classList.remove("coprompt-dragging");
    if (button) button.style.cursor = "pointer";

    // Reset dragging state and distance
    isButtonDragging = false;
    dragDistance = 0;  // Reset drag distance
    
    // Only update lastDragEndTime if we actually dragged
    if (hasDragged) {
        lastDragEndTime = Date.now();
    }

    // Save position to localStorage
    const rect = element.getBoundingClientRect();
    try {
        localStorage.setItem(
            "coPromptButtonPosition",
            JSON.stringify({
                top: rect.top,
                left: rect.left,
            }),
        );
        debugLog("Saved button position:", rect.top, rect.left);
    } catch (e) {
        debugLog("Failed to save button position:", e);
    }
  }

  // Handle touch events for mobile
  element.addEventListener("touchstart", handleTouchStart, { passive: false });
  element.addEventListener("touchmove", handleTouchMove, { passive: false });
  element.addEventListener("touchend", handleTouchEnd, { passive: false });

  function handleTouchStart(e) {
    e.preventDefault();

    const touch = e.touches[0];
    pos3 = touch.clientX;
    pos4 = touch.clientY;
    startX = touch.clientX;
    startY = touch.clientY;
    dragStartTime = Date.now();
    hasDragged = false; // Reset drag flag

    // Reset drag distance on new drag
    dragDistance = 0;

    element.classList.add("coprompt-dragging");
    if (button) button.style.cursor = "grabbing";

    isButtonDragging = true;
  }

  function handleTouchMove(e) {
    if (!isButtonDragging) return;

    e.preventDefault();

    const touch = e.touches[0];

    pos1 = pos3 - touch.clientX;
    pos2 = pos4 - touch.clientY;
    pos3 = touch.clientX;
    pos4 = touch.clientY;

    // Calculate total drag distance
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    dragDistance = Math.sqrt(dx * dx + dy * dy);

    // Set hasDragged flag if we've moved beyond the threshold
    if (dragDistance > DRAG_THRESHOLD) {
        hasDragged = true;
    }

    // Set the element's new position
    const newTop = element.offsetTop - pos2;
    const newLeft = element.offsetLeft - pos1;

    // Ensure the button stays within the viewport
    if (newTop > 0 && newTop < window.innerHeight - 50) {
      element.style.top = newTop + "px";
    }

    if (newLeft > 0 && newLeft < window.innerWidth - 50) {
      element.style.left = newLeft + "px";
    }

    // When using top/left, we need to set bottom/right to auto
    element.style.bottom = "auto";
    element.style.right = "auto";
  }

  function handleTouchEnd(e) {
    e.preventDefault();

    element.classList.remove("coprompt-dragging");
    if (button) button.style.cursor = "pointer";

    // Reset dragging state and distance
    isButtonDragging = false;
    dragDistance = 0;  // Reset drag distance
    
    // Reset drag distance attribute
    if (button) {
      button.setAttribute("data-drag-distance", "0");
    }

    // Save position to localStorage
    const rect = element.getBoundingClientRect();
    try {
      localStorage.setItem(
        "coPromptButtonPosition",
        JSON.stringify({
          top: rect.top,
          left: rect.left,
        }),
      );
    } catch (e) {
      debugLog("Failed to save button position:", e);
    }
  }
}

// Update the click handler in createFloatingButton
function createFloatingButton() {
  debugLog("Creating floating CoPrompt button");

  // Remove any existing floating button
  const existingContainer = document.getElementById("coprompt-container");
  if (existingContainer) {
    existingContainer.remove();
  }

  // Create a container for the floating button
  const buttonContainer = document.createElement("div");
  buttonContainer.id = "coprompt-container";
  buttonContainer.style.cssText = `
        position: fixed !important;
        z-index: 99999 !important;
        bottom: 80px !important; 
        right: 20px !important;
        cursor: move !important;
        background-color: transparent !important;
        box-shadow: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        pointer-events: auto !important;
        width: auto !important;
        height: auto !important;
        min-width: 120px !important;
        min-height: 36px !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
    `;

  // Try to restore previous position
  let savedPosition = localStorage.getItem("coPromptButtonPosition");
  if (savedPosition) {
    try {
      savedPosition = JSON.parse(savedPosition);
      // Only use saved position if it's within the viewport
      if (
        savedPosition.top > 0 &&
        savedPosition.top < window.innerHeight - 100 &&
        savedPosition.left > 0 &&
        savedPosition.left < window.innerWidth - 100
      ) {
        buttonContainer.style.top = savedPosition.top + "px";
        buttonContainer.style.left = savedPosition.left + "px";
        // Remove bottom/right if we're using top/left
        buttonContainer.style.bottom = "auto";
        buttonContainer.style.right = "auto";
      }
    } catch (e) {
      debugLog("Error restoring button position:", e);
      // Use default position if parsing fails
    }
  }

  // Create the button
  const enhanceButton = document.createElement("button");
  enhanceButton.id = "coprompt-button";
  enhanceButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles" style="margin-right: 6px;">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
            <path d="M20 3v4"></path>
            <path d="M22 5h-4"></path>
            <path d="M4 17v2"></path>
            <path d="M5 18H3"></path>
        </svg>
        Improve Prompt
    `;
  enhanceButton.type = "button";
  enhanceButton.style.cssText = `
        padding: 8px 12px !important;
        background: #0070F3 !important;
        color: white !important;
        border: none !important;
        border-radius: 18px !important;
        box-shadow: 0 2px 8px rgba(0, 112, 243, 0.3) !important;
        font-weight: 500 !important;
        font-size: 14px !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        min-width: 120px !important;
        min-height: 36px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 99999 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        letter-spacing: 0.3px !important;
        text-transform: none !important;
        visibility: visible !important;
        opacity: 0.9 !important;
        position: relative !important;
        pointer-events: auto !important;
    `;

  // Hover effect
  enhanceButton.onmouseover = function () {
    this.style.transform = "scale(1.03)";
    this.style.boxShadow = "0 3px 10px rgba(0, 112, 243, 0.4)";
    this.style.opacity = "1";
  };

  enhanceButton.onmouseout = function () {
    this.style.transform = "scale(1)";
    this.style.boxShadow = "0 2px 8px rgba(0, 112, 243, 0.3)";
    this.style.opacity = "0.9";
  };

  // Add click handler
  enhanceButton.addEventListener("click", function(event) {
    event.preventDefault();
    event.stopPropagation();
    debugLog("Button clicked, checking drag state:", { 
        isButtonDragging, 
        dragDistance,
        hasDragged,
        timeSinceLastDrag: Date.now() - lastDragEndTime
    });

    // Check if this is a click after a drag
    const isClickAfterDrag = hasDragged && Date.now() - lastDragEndTime < CLICK_DELAY;
    
    // Only proceed if:
    // 1. We're not currently dragging
    // 2. The drag distance was small (if any)
    // 3. It's not immediately after a drag
    if (!isButtonDragging && dragDistance < DRAG_THRESHOLD && !isClickAfterDrag) {
        const activeElement = document.activeElement;
        debugLog("Active element:", activeElement);
        
        if (activeElement && (activeElement.tagName === "TEXTAREA" || activeElement.getAttribute("contenteditable") === "true")) {
            debugLog("Found valid input element, calling handleEnhanceClick");
            handleEnhanceClick(activeElement);
        } else {
            debugLog("No active input element found");
        }
    } else {
        debugLog("Ignoring click due to:", {
            isButtonDragging,
            dragDistance,
            hasDragged,
            isClickAfterDrag,
            timeSinceLastDrag: Date.now() - lastDragEndTime
        });
    }
  });

  buttonContainer.appendChild(enhanceButton);
  document.body.appendChild(buttonContainer);
  makeDraggable(buttonContainer);

  buttonInjected = true;
  debugLog("CoPrompt floating button created and attached");

  // Force the button to be visible after a short delay
  setTimeout(() => {
    const button = document.getElementById("coprompt-button");
    const container = document.getElementById("coprompt-container");

    if (button && container) {
      // Force visibility with !important flags
      container.style.cssText += `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                z-index: 99999 !important;
            `;

      button.style.cssText += `
                display: flex !important;
                visibility: visible !important;
                opacity: 0.9 !important;
                z-index: 99999 !important;
            `;

      debugLog("Forced button visibility");
    } else {
      debugLog("Button not found after delay, recreating");
      buttonInjected = false;
      createFloatingButton();
    }
  }, 500);
}
