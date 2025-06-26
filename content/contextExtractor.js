// Logic for extracting conversation context from different platforms

const CONTEXT_LIMIT = 6; // Max number of messages to extract
const USER_ROLE = "user";
const ASSISTANT_ROLE = "assistant";

// Helper to dynamically import and use debugLog if needed
// In a real scenario, a shared logger instance might be better
async function logDebug(message, ...args) {
  try {
    // Assuming logger.js is also made web-accessible if needed by content scripts
    const { debugLog } = await import(chrome.runtime.getURL("utils/logger.js"));
    debugLog(message, ...args);
  } catch (e) {
    // Fallback or ignore if logger not available
    // console.log("[ContextExtractor DEBUG]", message, ...args);
  }
}

// --- Internal Platform-Specific Helpers ---

function _getContextFromElements(elements, platformConfig) {
  const allMessages = [];
  logDebug(
    `[${platformConfig.name}] Found ${elements.length} potential elements.`,
  );

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    let role = "";
    let content = "";

    try {
      const result = platformConfig.extractRoleAndContent(element);
      role = result.role;
      content = result.content;

      if (role && content) {
        const normalizedRole =
          role.toLowerCase() === ASSISTANT_ROLE ? ASSISTANT_ROLE : USER_ROLE;
        allMessages.push({ role: normalizedRole, content });
        logDebug(
          `[${platformConfig.name}] Added message: Role=${normalizedRole}, Index=${i}`,
        );
      } else {
        logDebug(
          `[${platformConfig.name}] Skipped element at index ${i}: Role='${role}', Content='${content?.substring(0, 50)}...'`,
        );
      }
    } catch (error) {
      console.error(
        `[ContextExtractor] Error processing message element on ${platformConfig.name}:`,
        element,
        error,
      );
    }
  }
  const recentMessages = allMessages.slice(-CONTEXT_LIMIT);
  return recentMessages;
}

const PLATFORM_CONFIGS = {
  CHATGPT: {
    name: "ChatGPT",
    hostIncludes: ["openai.com", "chatgpt.com"],
    selector: "[data-message-author-role]",
    extractRoleAndContent: (element) => {
      const role = element.getAttribute("data-message-author-role");
      const contentWrapper =
        element.querySelector(".markdown") ||
        element.querySelector('div[class*="prose"]');
      const content =
        contentWrapper?.textContent?.trim() ||
        element.textContent?.trim() ||
        "";
      return { role, content };
    },
  },
  CLAUDE: {
    name: "Claude",
    hostIncludes: ["claude.ai"],
    selector: '[data-testid="user-message"], .font-claude-message',
    extractRoleAndContent: (element) => {
      let role = "";
      if (element.matches('[data-testid="user-message"]')) {
        role = USER_ROLE;
      } else if (element.matches(".font-claude-message")) {
        role = ASSISTANT_ROLE;
      }
      const content = element.textContent?.trim() || "";
      return { role, content };
    },
  },
  GEMINI: {
    name: "Gemini",
    hostIncludes: ["gemini.google.com"],
    selector: ".query-content, .response-content",
    extractRoleAndContent: (element) => {
      let role = "";
      let content = "";
      if (element.matches(".query-content")) {
        role = USER_ROLE;
        content = element.textContent?.trim() || "";
      } else if (element.matches(".response-content")) {
        role = ASSISTANT_ROLE;
        const messageContentElement = element.querySelector("message-content");
        content = messageContentElement?.textContent?.trim() || "";
      }
      return { role, content };
    },
  },
  LOVABLE: {
    name: "Lovable",
    hostIncludes: ["lovable.dev"],
    selector:
      ".message, .chat-message, [data-role], .user-message, .ai-message, .conversation-item",
    extractRoleAndContent: (element) => {
      let role = "";
      let content = "";

      // Check for data attributes first (most reliable)
      const dataRole = element.getAttribute("data-role");
      if (dataRole) {
        role = dataRole === "user" ? USER_ROLE : ASSISTANT_ROLE;
      } else {
        // Check for class-based role detection
        if (
          element.matches(".user-message") ||
          element.classList.contains("user")
        ) {
          role = USER_ROLE;
        } else if (
          element.matches(".ai-message, .assistant-message") ||
          element.classList.contains("assistant") ||
          element.classList.contains("ai")
        ) {
          role = ASSISTANT_ROLE;
        } else {
          // Fallback: check parent containers or position-based detection
          const messageContainer = element.closest("[data-message-role]");
          if (messageContainer) {
            const containerRole =
              messageContainer.getAttribute("data-message-role");
            role = containerRole === "user" ? USER_ROLE : ASSISTANT_ROLE;
          }
        }
      }

      // Extract content with multiple fallback strategies
      const contentSelectors = [
        ".message-content",
        ".chat-content",
        ".text-content",
        ".message-text",
        "p",
        ".content",
      ];

      for (const selector of contentSelectors) {
        const contentEl = element.querySelector(selector);
        if (contentEl) {
          content = contentEl.textContent?.trim() || "";
          break;
        }
      }

      // Fallback to element's direct text content
      if (!content) {
        content = element.textContent?.trim() || "";
      }

      return { role, content };
    },
  },
};

/**
 * Extracts recent conversation history from the current page.
 * Detects the platform and uses the appropriate extraction logic.
 * @returns {Array<Object>} An array of message objects ({ role: string, content: string }), oldest first.
 */
export function getConversationContext() {
  const hostname = window.location.hostname;
  logDebug("Getting context for hostname:", hostname);

  let activePlatformConfig = null;
  for (const key in PLATFORM_CONFIGS) {
    const config = PLATFORM_CONFIGS[key];
    if (config.hostIncludes.some((host) => hostname.includes(host))) {
      activePlatformConfig = config;
      break;
    }
  }

  if (!activePlatformConfig) {
    logDebug("Unsupported hostname for context extraction:", hostname);
    return [];
  }

  const conversationElements = document.querySelectorAll(
    activePlatformConfig.selector,
  );

  if (!conversationElements || conversationElements.length === 0) {
    logDebug(
      `No conversation elements found with selector for ${activePlatformConfig.name}:`,
      activePlatformConfig.selector,
    );
    return [];
  }

  const messages = _getContextFromElements(
    conversationElements,
    activePlatformConfig,
  );
  logDebug("Final recentMessages (should be oldest first):", messages);
  return messages;
}
