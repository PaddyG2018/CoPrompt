// REMOVED import { createLogger } from './utils/logger.js';

// REMOVED const logger = createLogger('content');

// Re-add simple DEBUG flag (assuming background.js check is sufficient)
// We might need a way to get this from background if not in manifest
const DEBUG = false; // Set to false for production manually for now

// Inject `injected.js` into the page properly
const script = document.createElement("script");
script.src = chrome.runtime.getURL("injected.js");
script.type = 'module'; // Ensure it's loaded as a module
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

// Update the handleEnhanceClick function
async function handleEnhanceClick(inputElement) {
  debugLog("handleEnhanceClick called with element:", inputElement);
  const originalPrompt = inputElement.value || inputElement.innerText;

  if (!originalPrompt) {
    console.error("Prompt is empty, cannot enhance.");
    return;
  }

  // Visual feedback: Add loading class to button
  const button = document.querySelector("#coprompt-button");
  if (button) {
    debugLog("Updating button to loading state");
    button.classList.add("coprompt-loading");
    button.disabled = true; // Disable button during loading

    // Set loading content (dots + text)
    button.innerHTML = `
      <div class="coprompt-loading-dots-container">
        <div class="coprompt-loading-dot"></div>
        <div class="coprompt-loading-dot"></div>
        <div class="coprompt-loading-dot"></div>
      </div>
      <span>Enhancing</span>
    `;
  }

  // Dynamically import the constant when needed
  const { MAIN_SYSTEM_INSTRUCTION } = await import(chrome.runtime.getURL('utils/constants.js'));

  // Send the enhance request to the background script
  window.postMessage(
    {
      type: "CoPromptEnhanceRequest",
      prompt: originalPrompt,
      systemInstruction: MAIN_SYSTEM_INSTRUCTION,
    },
    "*",
  );
  console.log("Sent CoPromptEnhanceRequest message"); // Reverted to console.log (info level)
}

// Debounced observer callback
const debouncedObserverCallback = debounce(async (mutations) => { // Make async
  if (buttonInjected && checkButtonVisibility()) return;

  // Use dynamic import here as well
  const { findActiveInputElement } = await import(chrome.runtime.getURL('utils/domUtils.js'));
  const inputField = findActiveInputElement();
  if (inputField && !buttonInjected) { // Only create if not already injected
    // If an input field is found and button isn't there, create it
    debugLog("Input field found by observer, creating floating button.");
    createFloatingButton(); 
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

  // Check if button is visible (getBoundingClientRect is sufficient)
  const rect = existingButton.getBoundingClientRect();
  const style = window.getComputedStyle(existingButton);

  // Check basic visibility properties handled by CSS
  if (
    rect.width === 0 ||
    rect.height === 0 ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    parseFloat(style.opacity) < 0.1 // Check opacity if needed
  ) {
    debugLog("Button exists but computed style indicates it's not visible. CSS should handle this with !important.");
    // Removed direct style manipulation here
  }

  // If button is outside viewport, reset position
  // Keep this logic as it relates to position, not just visibility
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
}, 5000); // Check every 5 seconds

// Create Floating Button function
function createFloatingButton() {
  debugLog("Creating floating CoPrompt button");

  // Check if container already exists
  let buttonContainer = document.getElementById("coprompt-container");
  if (buttonContainer) {
    debugLog("Container already exists");
    // Ensure it's visible if it was hidden
    buttonContainer.style.display = "block";
    const btn = buttonContainer.querySelector("#coprompt-button");
    if (btn) btn.style.display = "flex";
    return;
  }

  // Create container div
  buttonContainer = document.createElement("div");
  buttonContainer.id = "coprompt-container";
  // Apply container styles via CSS using ID selector

  // Restore position from localStorage if available
  try {
    const savedPosition = localStorage.getItem("coPromptButtonPosition");
    if (savedPosition) {
      const { top, left } = JSON.parse(savedPosition);
      if (top !== null && left !== null) {
         // Basic check to ensure it's within reasonable bounds
         if (top > 0 && left > 0 && top < window.innerHeight - 50 && left < window.innerWidth - 50) {
            buttonContainer.style.top = `${top}px`;
            buttonContainer.style.left = `${left}px`;
            buttonContainer.style.bottom = 'auto';
            buttonContainer.style.right = 'auto';
            debugLog("Restored button position:", top, left);
         } else {
             debugLog("Saved position out of bounds, using default.");
         }
      }
    }
  } catch (e) {
    debugLog("Failed to parse saved button position:", e);
    // Use default position if parsing fails
  }

  // Create the button
  const enhanceButton = document.createElement("button");
  enhanceButton.id = "coprompt-button";
  // Button styles applied via CSS using ID selector

  // Set initial content (icon + text)
  enhanceButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
      <path d="M20 3v4"></path>
      <path d="M22 5h-4"></path>
      <path d="M4 17v2"></path>
      <path d="M5 18H3"></path>
    </svg>
    Improve Prompt
  `;
  enhanceButton.type = "button";

  buttonContainer.appendChild(enhanceButton);
  document.body.appendChild(buttonContainer);
  
  // Define the click handler logic to pass as a callback
  const handleButtonClick = async (event) => {
    // REMOVED handleButtonClick called log
    try {
        const { findActiveInputElement } = await import(chrome.runtime.getURL('utils/domUtils.js'));
        const activeElement = findActiveInputElement();
        // Keep debugLog for active element
        debugLog("Active element on click:", activeElement);
        
        if (activeElement) {
            // Keep debugLog for calling enhance
            debugLog("Valid click and active input found, calling handleEnhanceClick");
            handleEnhanceClick(activeElement); 
        } else {
            // Keep debugLog for no active input
            debugLog("Valid click, but no active input element found.");
        }
    } catch(err) {
        console.error("[ContentScript] Error during button click handling:", err); // Keep error
    }
  };

  // Dynamically import and apply the new makeDraggable, passing the click handler
  (async () => {
    // REMOVED Attempting to import log
    try {
        const interactionModule = await import(chrome.runtime.getURL('content/interactionHandler.js'));
        // REMOVED imported successfully log
        if (interactionModule.makeDraggable) {
            interactionModule.makeDraggable(buttonContainer, handleButtonClick, enhanceButton);
            // REMOVED Applied makeDraggable log
        } else {
            console.error("[ContentScript] makeDraggable function not found in module!"); // Keep error
        }
    } catch (error) {
        console.error("[ContentScript] Failed to load or apply interaction handler:", error); // Keep error
    }
  })();

  buttonInjected = true;
  debugLog("CoPrompt floating button created and attached");

  // Force the button to be visible after a short delay
  setTimeout(() => {
    const button = document.getElementById("coprompt-button");
    const container = document.getElementById("coprompt-container");

    if (button && container) {
        // Ensure classes are present if needed (though IDs should suffice)
        debugLog("Button exists, CSS should handle visibility.");
    } else {
      debugLog("Button not found after delay, recreating");
      buttonInjected = false;
      createFloatingButton();
    }
  }, 500);
}

// --- Register the message handler dynamically --- 
(async () => {
  try {
    // Dynamically import the handler
    const messageHandlerModule = await import(chrome.runtime.getURL('content/messageHandler.js'));
    if (messageHandlerModule.handleWindowMessage) {
      // Add the event listener using the imported handler
      window.addEventListener("message", messageHandlerModule.handleWindowMessage);
      console.log("CoPrompt: Message handler registered successfully."); // Keep this info log
    } else {
      console.error("CoPrompt: Failed to find handleWindowMessage in the loaded module.");
    }
  } catch (error) {
    console.error("CoPrompt: Failed to load or register message handler module:", error);
  }
})();
