// Handles drag-and-drop interaction for UI elements

// TODO: Define state management object
// TODO: Define helper for viewport constraints
// TODO: Define helper for click-vs-drag detection
// TODO: Define consolidated event handlers (Pointer Events?)

// Helper to dynamically import and use debugLog if needed
// async function logDebug(message, ...args) {
//   try {
//     const { debugLog } = await import(chrome.runtime.getURL('utils/logger.js'));
//     debugLog(message, ...args);
//   } catch (e) { /* console.log("[InteractionHandler DEBUG]", message, ...args); */ }
// }

// Configuration Constants
const DRAG_THRESHOLD = 3; // Lowered threshold for more sensitivity

import { findActiveInputElement } from "../utils/domUtils.js";

// Add local DEBUG flag
const DEBUG = true; // Set true for development logs

// Logging specifically for interaction handler
function logInteractionHandlerDebug(...args) {
  if (DEBUG) {
    console.log("[CoPrompt IH Debug]", ...args);
  }
}
function logInteractionHandlerError(...args) {
  console.error("[CoPrompt IH Error]", ...args);
}

/**
 * Applies viewport constraints to a position.
 * @param {number} initialPos The initial coordinate (top or left).
 * @param {number} offset The change in position.
 * @param {number} maxDimension The maximum viewport dimension (innerHeight or innerWidth).
 * @param {number} elementSize The actual size of the element dimension (height or width).
 * @returns {number} The constrained position.
 */
function constrainToViewport(initialPos, offset, maxDimension, elementSize) {
  let newPos = initialPos + offset;
  if (newPos < 0) newPos = 0;
  const maxPos = maxDimension - elementSize;
  if (newPos > maxPos) newPos = maxPos;
  return newPos;
}

/**
 * Makes a given element draggable within the viewport using Pointer Events.
 * Triggers an onClick callback for interactions determined to be clicks.
 * @param {HTMLElement} draggableElement The container element to make draggable and apply styles/state to.
 * @param {Function} onClick Callback function to execute on a click interaction.
 * @param {HTMLElement} [handleElement=draggableElement] The element to attach the initial pointerdown listener to. Defaults to draggableElement.
 */
export function makeDraggable(draggableElement, onClick, handleElement = null) {
  logInteractionHandlerDebug("makeDraggable called for container:", draggableElement, "and button:", handleElement);
  const listenerTarget = handleElement || draggableElement;

  if (!draggableElement) {
    console.error(
      "[InteractionHandler] makeDraggable called with null draggableElement",
    );
    return;
  }

  // Attach state directly to the draggable element
  draggableElement._dragState = {
    isPointerDown: false,
    isDragging: false,
    initialLeft: 0,
    initialTop: 0,
    initialWidth: 0,
    initialHeight: 0,
    startX: 0,
    startY: 0,
    lastPointerUpTime: 0,
    pointerId: null,
    targetInputElement: null,
  };

  // --- Pointer Event Handlers ---
  // NOTE: All references inside these handlers should still use 'draggableElement'
  // for positioning and state management, even though the initial listener might
  // be on 'handleElement'. This works due to closures.

  const handlePointerDown = (event) => {
    // Only respond to primary button (usually left mouse or single touch)
    // Ignore if already handling another pointer
    if (event.button !== 0 || draggableElement._dragState.isPointerDown) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    // --- Find and Store Target Input Element ---
    draggableElement._dragState.targetInputElement = findActiveInputElement();
    logInteractionHandlerDebug("Target input element found on pointerdown:", draggableElement._dragState.targetInputElement);
    // --- End Store --- 

    // Set state on the draggable element
    draggableElement._dragState.isPointerDown = true;
    draggableElement._dragState.isDragging = false;
    draggableElement._dragState.startX = event.clientX;
    draggableElement._dragState.startY = event.clientY;
    draggableElement._dragState.pointerId = event.pointerId;

    // --- Get POSITION from draggableElement, SIZE from handleElement ---
    const dragRect = draggableElement.getBoundingClientRect();
    const handleRect = listenerTarget.getBoundingClientRect(); // listenerTarget is handleElement or draggableElement

    const currentLeft = dragRect.left;
    const currentTop = dragRect.top;
    // Use the HANDLE's size for constraint calculation
    const currentWidth = handleRect.width;
    const currentHeight = handleRect.height;
    // --- End Change ---

    // Calculate the constrained position based on current rendering
    const constrainedInitialTop = constrainToViewport(
      currentTop,
      0,
      window.innerHeight,
      currentHeight,
    );
    const constrainedInitialLeft = constrainToViewport(
      currentLeft,
      0,
      window.innerWidth,
      currentWidth,
    );

    // Store the *constrained* position and the HANDLE's size in state
    draggableElement._dragState.initialLeft = constrainedInitialLeft;
    draggableElement._dragState.initialTop = constrainedInitialTop;
    draggableElement._dragState.initialWidth = currentWidth; // Store handle's width
    draggableElement._dragState.initialHeight = currentHeight; // Store handle's height

    // Add class to draggable element
    draggableElement.classList.add("coprompt-dragging");
    // Capture pointer on the element that received the event (listenerTarget)
    listenerTarget.setPointerCapture(event.pointerId);

    // Add move/up listeners to the element that received the event (listenerTarget)
    listenerTarget.addEventListener("pointermove", handlePointerMove);
    listenerTarget.addEventListener("pointerup", handlePointerUp);
    listenerTarget.addEventListener("pointercancel", handlePointerUp); // Treat cancel like up
  };

  const handlePointerMove = (event) => {
    // Use draggableElement state
    if (
      !draggableElement._dragState.isPointerDown ||
      event.pointerId !== draggableElement._dragState.pointerId
    )
      return;
    event.preventDefault();
    event.stopPropagation();

    // Calculate total offset from the start position
    const offsetX = event.clientX - draggableElement._dragState.startX;
    const offsetY = event.clientY - draggableElement._dragState.startY;
    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);

    // If moved beyond threshold, mark as dragging
    if (!draggableElement._dragState.isDragging && distance > DRAG_THRESHOLD) {
      draggableElement._dragState.isDragging = true;
      logInteractionHandlerDebug("Drag threshold exceeded, isDragging = true");
    }

    // Calculate new position based on initial pos + total offset
    // Pass ACTUAL element size to constrain function
    const constrainedTop = constrainToViewport(
      draggableElement._dragState.initialTop,
      offsetY,
      window.innerHeight,
      draggableElement._dragState.initialHeight,
    );
    const constrainedLeft = constrainToViewport(
      draggableElement._dragState.initialLeft,
      offsetX,
      window.innerWidth,
      draggableElement._dragState.initialWidth,
    );

    // Apply new position
    draggableElement.style.top = `${constrainedTop}px`;
    draggableElement.style.left = `${constrainedLeft}px`;
    draggableElement.style.bottom = "auto";
    draggableElement.style.right = "auto";
  };

  const handlePointerUp = (event) => {
    // Use draggableElement state
    if (
      !draggableElement._dragState.isPointerDown ||
      event.pointerId !== draggableElement._dragState.pointerId
    )
      return;
    event.preventDefault();
    event.stopPropagation();

    // Release capture on the element that received the event (listenerTarget)
    listenerTarget.releasePointerCapture(event.pointerId);
    // Remove class from draggable element
    draggableElement.classList.remove("coprompt-dragging");

    // Check dragging state on draggableElement
    const wasDragging = draggableElement._dragState.isDragging;

    // Update state on draggableElement
    draggableElement._dragState.lastPointerUpTime = Date.now();
    draggableElement._dragState.isPointerDown = false;
    draggableElement._dragState.pointerId = null;
    draggableElement._dragState.isDragging = false;

    // Remove listeners from the element that received the event (listenerTarget)
    listenerTarget.removeEventListener("pointermove", handlePointerMove);
    listenerTarget.removeEventListener("pointerup", handlePointerUp);
    listenerTarget.removeEventListener("pointercancel", handlePointerUp);

    // Save position using draggableElement properties if dragging occurred
    if (wasDragging) {
      try {
        const rect = draggableElement.getBoundingClientRect();
        localStorage.setItem(
          "coPromptButtonPosition",
          JSON.stringify({ top: rect.top, left: rect.left }),
        );
      } catch (e) {
        console.error("Error saving button position:", e);
      }
    }

    // Call onClick callback if it wasn't a drag
    if (!wasDragging) {
      if (typeof onClick === "function") {
        logInteractionHandlerDebug("Click detected (isDragging is false), calling provided onClick callback...");
        try {
          // Pass the handleElement, its requestId, AND the stored target input to the callback
          const requestId = handleElement?.dataset.coPromptRequestId;
          const targetInput = draggableElement._dragState.targetInputElement; 
          onClick(handleElement, requestId, targetInput); // Pass targetInput
        } catch (error) {
          logInteractionHandlerError("Error executing onClick callback:", error);
        }
      }
    } else {
      logInteractionHandlerDebug("Drag detected (isDragging is true), click skipped.");
    }
  };

  // Attach the initial listener to the specified target (handle or draggable element)
  listenerTarget.addEventListener("pointerdown", handlePointerDown);
}
