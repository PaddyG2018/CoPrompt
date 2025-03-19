// Inject `injected.js` into the page properly
const script = document.createElement("script");
script.src = chrome.runtime.getURL("injected.js");
script.onload = function() { this.remove(); }; // Remove once loaded
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

// Add debug function to help troubleshoot
function debugLog(message, obj = null) {
    // Only log if debug mode is enabled
    const debugMode = false; // Set to false to disable most logs
    
    if (debugMode) {
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
        debugLog("Button not found in DOM");
        buttonInjected = false;
        return false;
    }
    
    const rect = button.getBoundingClientRect();
    debugLog("Button dimensions:", {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        visible: rect.width > 0 && rect.height > 0
    });
    
    // Check if button is actually visible
    const style = window.getComputedStyle(button);
    debugLog("Button computed style:", {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex
    });
    
    // If button exists but isn't visible, try to fix it
    if (rect.width === 0 || rect.height === 0 || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        console.log("Button exists but is not visible, attempting to fix...");
        
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
        () => document.querySelector("div.ProseMirror[contenteditable='true']#prompt-textarea"),
        // Strategy 2: Any contenteditable with prompt-textarea ID
        () => document.querySelector("#prompt-textarea[contenteditable='true']"),
        // Strategy 3: Legacy textarea
        () => document.querySelector("textarea:not([style*='display: none'])")
    ];

    for (const strategy of strategies) {
        const element = strategy();
        if (element && element.offsetParent !== null) {
            debugLog("Found input field using strategy:", strategy.toString());
            return element;
        }
    }

    return null;
};

// Function to extract conversation context
function getConversationContext() {
    // Get conversation elements from the page
    const conversationElements = document.querySelectorAll('[data-message-author-role]');
    
    // Extract the last few messages (up to 6)
    const contextLimit = 6;
    const recentMessages = [];
    
    // Process messages from newest to oldest
    for (let i = conversationElements.length - 1; i >= 0 && recentMessages.length < contextLimit; i--) {
        const element = conversationElements[i];
        const role = element.getAttribute('data-message-author-role');
        
        recentMessages.unshift({
            role: role === 'assistant' ? 'assistant' : 'user',
            content: element.textContent.trim()
        });
    }
    
    return recentMessages;
}

// ✅ Fix: Ensure `content.js` can get API key from `background.js` for `injected.js`
window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    
    // Handle API key request
    if (event.data.type === "CoPromptGetAPIKey") {
        chrome.runtime.sendMessage({ type: "GET_API_KEY" }, (response) => {
            if (response?.key) {
                window.postMessage({ type: "CoPromptAPIKeyResponse", key: response.key }, "*");
            } else {
                console.error("API key retrieval failed in content.js");
                window.postMessage({ type: "CoPromptAPIKeyResponse", key: null }, "*");
            }
        });
    }
    
    // Handle enhance prompt request (new)
    if (event.data.type === "CoPromptEnhanceRequest") {
        console.log("Content script: Relaying prompt enhancement request to background script");
        
        // Get conversation context
        const conversationContext = getConversationContext();
        console.log("Conversation context:", conversationContext);
        
        // Track when the request was sent
        const requestStartTime = Date.now();
        console.log("Content script: Sending request to background script at", new Date().toISOString());
        
        // Set up a timeout for the background script response
        const timeoutId = setTimeout(() => {
            console.error("Content script: Background script response timed out after 55 seconds");
            window.postMessage({ 
                type: "CoPromptEnhanceResponse", 
                error: "Background script response timed out (55s). Please try again or check your API key." 
            }, "*");
        }, 55000); // 55 second timeout (slightly less than injected.js timeout)
        
        chrome.runtime.sendMessage({ 
            type: "ENHANCE_PROMPT", 
            prompt: event.data.prompt,
            systemInstruction: event.data.systemInstruction,
            conversationContext: conversationContext
        }, (response) => {
            // Clear the timeout since we got a response
            clearTimeout(timeoutId);
            
            // Calculate how long the request took
            const requestTime = (Date.now() - requestStartTime) / 1000;
            console.log(`Content script: Received response from background script after ${requestTime.toFixed(2)} seconds`);
            
            if (!response) {
                console.error("Content script: No response received from background script (possible timeout)");
                window.postMessage({ 
                    type: "CoPromptEnhanceResponse", 
                    error: "No response from background script (possible timeout)" 
                }, "*");
                return;
            }
            
            if (response?.error) {
                console.error("Content script: Error from background script:", response.error);
                window.postMessage({ 
                    type: "CoPromptEnhanceResponse", 
                    error: response.error 
                }, "*");
            } else if (response?.enhancedPrompt) {
                console.log("Content script: Received enhanced prompt from background");
                window.postMessage({ 
                    type: "CoPromptEnhanceResponse", 
                    enhancedPrompt: response.enhancedPrompt 
                }, "*");
            } else {
                console.error("Content script: Invalid response from background script", response);
                window.postMessage({ 
                    type: "CoPromptEnhanceResponse", 
                    error: "Invalid response from background script" 
                }, "*");
            }
        });
    }
});

// Make element draggable
function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let isDragging = false;
    let dragDistance = 0;
    let startX = 0, startY = 0;
    
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
        
        // Reset drag distance on new drag
        dragDistance = 0;
        
        // Add dragging class for visual feedback
        element.classList.add("coprompt-dragging");
        if (button) button.style.cursor = "grabbing";
        
        isDragging = true;
        
        // Set up event listeners for drag and end
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
        if (!isDragging) return;
        
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
        
        // Store drag distance as a data attribute on the button for the click handler to check
        if (button) {
            button.setAttribute('data-drag-distance', dragDistance);
        }
        
        // Set the element's new position
        const newTop = (element.offsetTop - pos2);
        const newLeft = (element.offsetLeft - pos1);
        
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
        
        isDragging = false;
        
        // Reset drag distance attribute
        if (button) {
            button.setAttribute('data-drag-distance', '0');
        }
        
        // Save position to localStorage
        const rect = element.getBoundingClientRect();
        try {
            localStorage.setItem('coPromptButtonPosition', JSON.stringify({
                top: rect.top,
                left: rect.left
            }));
            console.log("Saved button position:", rect.top, rect.left);
        } catch (e) {
            console.error("Failed to save button position:", e);
        }
    }
    
    // Handle touch events for mobile
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    function handleTouchStart(e) {
        e.preventDefault();
        
        const touch = e.touches[0];
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        startX = touch.clientX;
        startY = touch.clientY;
        
        // Reset drag distance on new drag
        dragDistance = 0;
        
        element.classList.add("coprompt-dragging");
        if (button) button.style.cursor = "grabbing";
        
        isDragging = true;
    }
    
    function handleTouchMove(e) {
        if (!isDragging) return;
        
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
        
        // Store drag distance as a data attribute on the button for the click handler to check
        if (button) {
            button.setAttribute('data-drag-distance', dragDistance);
        }
        
        // Set the element's new position
        const newTop = (element.offsetTop - pos2);
        const newLeft = (element.offsetLeft - pos1);
        
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
        
        isDragging = false;
        
        // Reset drag distance attribute
        if (button) {
            button.setAttribute('data-drag-distance', '0');
        }
        
        // Save position to localStorage
        const rect = element.getBoundingClientRect();
        try {
            localStorage.setItem('coPromptButtonPosition', JSON.stringify({
                top: rect.top,
                left: rect.left
            }));
        } catch (e) {
            console.error("Failed to save button position:", e);
        }
    }
}

function injectButton(inputElement) {
    if (buttonInjected && checkButtonVisibility()) return;
    
    console.log("Injecting CoPrompt button...");
    
    try {
        // Remove any existing button first to avoid duplicates
        const existingButton = document.getElementById("coprompt-button");
        if (existingButton) {
            existingButton.parentElement.remove();
            debugLog("Removed existing button");
        }
        
        // UPDATED: Use a more reliable method to find the action buttons area
        // First, try to find the form that contains the input
        const form = inputElement.closest("form");
        if (!form) {
            debugLog("Could not find parent form");
            createFloatingButton();
            return;
        }
        
        // Find the action buttons container - try multiple strategies
        let actionContainer = null;
        
        // Strategy 1: Look for the send button
        const sendButton = form.querySelector("button[data-testid='send-button']");
        if (sendButton) {
            // Get the parent container of the send button
            actionContainer = sendButton.parentElement.parentElement;
            debugLog("Found action container via send button");
        }
        
        // Strategy 2: Look for the flex container with buttons
        if (!actionContainer) {
            const flexContainers = Array.from(form.querySelectorAll("div[class*='flex']"));
            // Find the one that contains buttons
            for (const container of flexContainers) {
                if (container.querySelector("button")) {
                    actionContainer = container;
                    debugLog("Found action container via flex container with buttons");
                    break;
                }
            }
        }
        
        // Strategy 3: Look for elements at the bottom of the form
        if (!actionContainer) {
            const allDivs = form.querySelectorAll("div");
            // Get the last few divs that might contain our target
            const lastDivs = Array.from(allDivs).slice(-10);
            for (const div of lastDivs) {
                if (div.querySelector("button")) {
                    actionContainer = div;
                    debugLog("Found action container via bottom form elements");
                    break;
                }
            }
        }
        
        if (!actionContainer) {
            debugLog("Could not find action container for button placement");
            
            // Fallback: Create a floating button instead
            createFloatingButton();
            return;
        }

        // Create our button container
        const buttonContainer = document.createElement("div");
        buttonContainer.id = "coprompt-container";
        buttonContainer.style.cssText = `
            margin-right: 8px;
            display: flex !important;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            position: relative;
        `;
        
        // Create the button using React-friendly approach
        const enhanceButton = document.createElement("button");
        enhanceButton.id = "coprompt-button";
        enhanceButton.type = "button"; // Prevent form submission
        enhanceButton.setAttribute("data-testid", "coprompt-enhance-button");
        
        // Use stronger inline styles instead of classes
        enhanceButton.style.cssText = `
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 8px 12px !important;
            border-radius: 18px !important;
            border: none !important;
            background-color: #0070F3 !important;
            color: white !important;
            font-weight: 500 !important;
            cursor: pointer !important;
            z-index: 9999 !important;
            position: relative !important;
            margin: 0 5px !important;
            box-shadow: 0 2px 8px rgba(0, 112, 243, 0.3) !important;
            font-size: 14px !important;
            min-width: 120px !important;
            min-height: 36px !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            letter-spacing: 0.3px !important;
            transition: all 0.2s ease !important;
            opacity: 0.9 !important;
        `;
        
        // Use text content instead of innerText
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

        // Add hover effects
        enhanceButton.onmouseover = function() {
            this.style.transform = "scale(1.03)";
            this.style.boxShadow = "0 3px 10px rgba(0, 112, 243, 0.4)";
            this.style.opacity = "1";
        };
        
        enhanceButton.onmouseout = function() {
            this.style.transform = "scale(1)";
            this.style.boxShadow = "0 2px 8px rgba(0, 112, 243, 0.3)";
            this.style.opacity = "0.9";
        };

        // Fix: Remove passive option since we need to call preventDefault
        enhanceButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Check if the button was dragged significantly before triggering action
            const dragDistance = parseFloat(enhanceButton.getAttribute('data-drag-distance') || '0');
            if (dragDistance >= 5) {
                // If dragged significantly, don't trigger the action
                return;
            }
            
            handleEnhanceClick(inputElement);
        });

        buttonContainer.appendChild(enhanceButton);
        
        // Try to insert before the send button if possible
        if (sendButton && sendButton.parentElement) {
            actionContainer.insertBefore(buttonContainer, sendButton.parentElement);
            debugLog("Inserted button before send button");
        } else {
            // Otherwise insert at the beginning of the action container
            actionContainer.insertBefore(buttonContainer, actionContainer.firstChild);
            debugLog("Inserted button at beginning of action container");
        }
        
        buttonInjected = true;
        console.log("CoPrompt button injected & event listener attached.");
        
        // Debug: Check if button is visible
        setTimeout(() => {
            checkButtonVisibility();
        }, 500);
        
    } catch (error) {
        console.error("Error injecting button:", error);
        buttonInjected = false;
        
        // Fallback to floating button
        createFloatingButton();
    }
}

// Fallback: Create a floating button if inline injection fails
function createFloatingButton() {
    console.log("Creating floating CoPrompt button");
    
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
    let savedPosition = localStorage.getItem('coPromptButtonPosition');
    if (savedPosition) {
        try {
            savedPosition = JSON.parse(savedPosition);
            // Only use saved position if it's within the viewport
            if (savedPosition.top > 0 && savedPosition.top < window.innerHeight - 100 &&
                savedPosition.left > 0 && savedPosition.left < window.innerWidth - 100) {
                buttonContainer.style.top = savedPosition.top + "px";
                buttonContainer.style.left = savedPosition.left + "px";
                // Remove bottom/right if we're using top/left
                buttonContainer.style.bottom = "auto";
                buttonContainer.style.right = "auto";
            }
        } catch (e) {
            console.error("Error restoring button position:", e);
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
    enhanceButton.onmouseover = function() {
        this.style.transform = "scale(1.03)";
        this.style.boxShadow = "0 3px 10px rgba(0, 112, 243, 0.4)";
        this.style.opacity = "1";
    };
    
    enhanceButton.onmouseout = function() {
        this.style.transform = "scale(1)";
        this.style.boxShadow = "0 2px 8px rgba(0, 112, 243, 0.3)";
        this.style.opacity = "0.9";
    };
    
    // Fix: Remove passive option since we need to call preventDefault
    enhanceButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        // Check if the button was dragged significantly before triggering action
        const dragDistance = parseFloat(enhanceButton.getAttribute('data-drag-distance') || '0');
        if (dragDistance >= 5) {
            // If dragged significantly, don't trigger the action
            return;
        }
        
        handleEnhanceClick(inputElement);
    });
    
    buttonContainer.appendChild(enhanceButton);
    document.body.appendChild(buttonContainer);
    makeDraggable(buttonContainer);
    
    buttonInjected = true;
    console.log("CoPrompt floating button created and attached");
    
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
            
            console.log("Forced button visibility");
        } else {
            console.log("Button not found after delay, recreating");
            buttonInjected = false;
            createFloatingButton();
        }
    }, 500);
}

// Separate click handler function
function handleEnhanceClick(inputElement) {
    // Get text from input element using multiple approaches
    let originalPrompt = '';
    
    // For contenteditable divs
    if (inputElement.getAttribute('contenteditable') === 'true') {
        // Try innerText first
        originalPrompt = inputElement.innerText || inputElement.textContent;
        
        // If that fails, try getting text from child nodes
        if (!originalPrompt) {
            const textNodes = [];
            const walker = document.createTreeWalker(inputElement, NodeFilter.SHOW_TEXT);
            let node;
            while (node = walker.nextNode()) {
                textNodes.push(node.nodeValue);
            }
            originalPrompt = textNodes.join(' ');
        }
    } 
    // For textareas
    else if (inputElement.tagName === 'TEXTAREA') {
        originalPrompt = inputElement.value;
    }
    // Fallback
    else {
        originalPrompt = inputElement.textContent || inputElement.innerText || inputElement.value || '';
    }
    
    if (!originalPrompt) {
        debugLog("No prompt text found in input element");
        return;
    }

    debugLog("Enhancing prompt:", originalPrompt);

    // Visual feedback with animation
    const button = document.querySelector("#coprompt-button");
    if (button) {
        // Create and add the loading animation
        button.innerHTML = '';
        
        // Add the dots container
        const dotsContainer = document.createElement('div');
        dotsContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            margin-right: 8px;
        `;
        
        // Create the three dots
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
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
        const textSpan = document.createElement('span');
        textSpan.textContent = 'Enhancing';
        
        // Add the animation keyframes to the document if they don't exist
        if (!document.getElementById('coprompt-animations')) {
            const style = document.createElement('style');
            style.id = 'coprompt-animations';
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

    // Use requestAnimationFrame for smoother UI updates
    requestAnimationFrame(() => {
        window.postMessage({ type: "CoPromptEnhance", prompt: originalPrompt }, "*");
    });
}

// Reset button state when receiving enhanced prompt
window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === "CoPromptEnhanced") {
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
        const improvedPrompt = event.data.improvedPrompt;
        if (!improvedPrompt) {
            console.log("No improved prompt received");
            return;
        }
        
        console.log("Received enhanced prompt, updating input field");
        
        // Find the input field using multiple strategies
        // IMPORTANT: We need to find the CURRENT input field, not rely on cached references
        let inputField = null;
        
        // Strategy 1: Direct ID selector for contenteditable
        inputField = document.querySelector("#prompt-textarea[contenteditable='true']");
        
        // Strategy 2: Direct ID selector for textarea
        if (!inputField) {
            inputField = document.querySelector("textarea#prompt-textarea");
        }
        
        // Strategy 3: Look for ProseMirror contenteditable
        if (!inputField) {
            inputField = document.querySelector("div.ProseMirror[contenteditable='true']");
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
            const contenteditables = document.querySelectorAll("div[contenteditable='true']");
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
                const formInput = form.querySelector("[contenteditable='true'], textarea");
                if (formInput) {
                    inputField = formInput;
                }
            }
        }
        
        if (!inputField) {
            console.log("Could not find input field to update with enhanced prompt");
            alert("Could not find the input field to update. The enhanced prompt has been copied to your clipboard.");
            
            // Copy to clipboard as a fallback
            navigator.clipboard.writeText(improvedPrompt).catch(e => {
                console.error("Failed to copy to clipboard:", e);
            });
            return;
        }
        
        // Update the input field with the enhanced prompt
        try {
            // For contenteditable divs (new ChatGPT interface)
            if (inputField.getAttribute('contenteditable') === 'true') {
                console.log("Updating contenteditable input field");
                
                // Try multiple approaches to update the contenteditable
                try {
                    // Approach 1: Direct innerHTML update
                    inputField.innerHTML = '';
                    const p = document.createElement('p');
                    p.textContent = improvedPrompt;
                    inputField.appendChild(p);
                    
                    // Dispatch necessary events to trigger ChatGPT's internal state updates
                    inputField.dispatchEvent(new Event('input', { bubbles: true }));
                    inputField.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Focus the input field
                    inputField.focus();
                    
                    console.log("Updated contenteditable using innerHTML approach");
                } catch (innerError) {
                    console.log("First approach failed, trying alternative method");
                    
                    // Approach 2: Using execCommand
                    try {
                        inputField.focus();
                        document.execCommand('selectAll', false, null);
                        document.execCommand('insertText', false, improvedPrompt);
                        console.log("Updated contenteditable using execCommand approach");
                    } catch (execError) {
                        console.log("Second approach failed, trying final method");
                        
                        // Approach 3: Using Selection API
                        try {
                            // Clear existing content
                            while (inputField.firstChild) {
                                inputField.removeChild(inputField.firstChild);
                            }
                            
                            // Insert text node
                            const text = document.createTextNode(improvedPrompt);
                            inputField.appendChild(text);
                            
                            // Trigger input event
                            const inputEvent = new Event('input', { bubbles: true });
                            inputField.dispatchEvent(inputEvent);
                            
                            console.log("Updated contenteditable using Selection API approach");
                        } catch (selectionError) {
                            throw new Error(`All contenteditable update approaches failed: ${selectionError.message}`);
                        }
                    }
                }
                
                // Place cursor at the end
                try {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(inputField);
                    range.collapse(false); // collapse to end
                    selection.removeAllRanges();
                    selection.addRange(range);
                } catch (cursorError) {
                    console.log("Failed to place cursor at end:", cursorError);
                }
                
                console.log("Successfully updated contenteditable input field");
            } 
            // For regular textareas (legacy interface)
            else if (inputField.tagName === 'TEXTAREA') {
                console.log("Updating textarea input field");
                inputField.value = improvedPrompt;
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                inputField.dispatchEvent(new Event('change', { bubbles: true }));
                inputField.focus();
                console.log("Successfully updated textarea input field");
            }
            else {
                console.log("Unknown input field type:", inputField.tagName);
            }
        } catch (error) {
            console.error("Error updating input field with enhanced prompt:", error);
            
            // Copy to clipboard as a fallback
            navigator.clipboard.writeText(improvedPrompt).catch(e => {
                console.error("Failed to copy to clipboard:", e);
            });
            alert("There was an error updating the input field. The enhanced prompt has been copied to your clipboard.");
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
        attributes: false // Reduce unnecessary triggers
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
        console.log("Button not found, recreating");
        buttonInjected = false;
        createFloatingButton();
        return;
    }
    
    // Check if button is visible
    const rect = existingButton.getBoundingClientRect();
    const style = window.getComputedStyle(existingButton);
    
    if (rect.width === 0 || rect.height === 0 || 
        style.display === 'none' || style.visibility === 'hidden' || 
        style.opacity === '0' || parseFloat(style.opacity) < 0.1) {
        
        console.log("Button exists but is not visible, forcing visibility");
        
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
        if (rect.top < 0 || rect.left < 0 || 
            rect.top > window.innerHeight || rect.left > window.innerWidth) {
            
            console.log("Button outside viewport, resetting position");
            container.style.top = "auto";
            container.style.left = "auto";
            container.style.bottom = "80px"; // Position higher to avoid input box
            container.style.right = "20px";
            
            // Clear saved position
            localStorage.removeItem('coPromptButtonPosition');
        }
    }
}, 5000); // Check every 5 seconds
