// Site Preferences Utility for CoPrompt
// Handles site-specific enable/disable functionality

/**
 * Default site preferences - all sites enabled by default
 */
export function getDefaultSitePreferences() {
  return {
    "chatgpt.com": { enabled: true },
    "claude.ai": { enabled: true },
    "gemini.google.com": { enabled: true },
    "lovable.dev": { enabled: true },
  };
}

/**
 * Get site preferences from storage with fallback to defaults
 * @returns {Promise<Object>} Site preferences object
 */
export async function getSitePreferences() {
  try {
    const result = await chrome.storage.sync.get(["site_preferences"]);
    return result.site_preferences || getDefaultSitePreferences();
  } catch (error) {
    console.error("[SitePrefs] Error getting site preferences:", error);
    return getDefaultSitePreferences();
  }
}

/**
 * Save site preferences to storage
 * @param {Object} preferences - Site preferences object
 * @returns {Promise<boolean>} Success status
 */
export async function saveSitePreferences(preferences) {
  try {
    await chrome.storage.sync.set({ site_preferences: preferences });
    return true;
  } catch (error) {
    console.error("[SitePrefs] Error saving site preferences:", error);
    return false;
  }
}

/**
 * Check if CoPrompt is enabled for the current site
 * @param {string} hostname - Current page hostname (e.g., 'chatgpt.com')
 * @returns {Promise<boolean>} Whether CoPrompt is enabled for this site
 */
export async function isSiteEnabled(hostname) {
  const preferences = await getSitePreferences();

  // Check each configured site to see if hostname matches
  for (const [site, config] of Object.entries(preferences)) {
    if (hostname.includes(site)) {
      return config.enabled;
    }
  }

  // Default to false for unknown sites (safety first)
  return false;
}

/**
 * Check if CoPrompt should show on the current page
 * Uses window.location.hostname by default
 * @returns {Promise<boolean>} Whether to show CoPrompt on current page
 */
export async function shouldShowOnCurrentSite() {
  const hostname = window.location.hostname;
  return await isSiteEnabled(hostname);
}

/**
 * Toggle a specific site's enabled status
 * @param {string} site - Site key (e.g., 'chatgpt.com')
 * @param {boolean} enabled - New enabled status
 * @returns {Promise<boolean>} Success status
 */
export async function toggleSite(site, enabled) {
  try {
    const preferences = await getSitePreferences();

    if (preferences[site]) {
      preferences[site].enabled = enabled;
      return await saveSitePreferences(preferences);
    } else {
      console.warn("[SitePrefs] Unknown site:", site);
      return false;
    }
  } catch (error) {
    console.error("[SitePrefs] Error toggling site:", error);
    return false;
  }
}

/**
 * Get display information for all supported sites
 * @returns {Array} Array of site info objects
 */
export function getSiteDisplayInfo() {
  return [
    {
      key: "chatgpt.com",
      name: "ChatGPT",
      icon: "💬",
      url: "chatgpt.com",
      description: "OpenAI ChatGPT",
    },
    {
      key: "claude.ai",
      name: "Claude",
      icon: "🤖",
      url: "claude.ai",
      description: "Anthropic Claude",
    },
    {
      key: "gemini.google.com",
      name: "Gemini",
      icon: "✨",
      url: "gemini.google.com",
      description: "Google Gemini",
    },
    {
      key: "lovable.dev",
      name: "Lovable",
      icon: "💝",
      url: "lovable.dev",
      description: "Lovable AI Development",
    },
  ];
}

/**
 * Initialize site preferences for new users
 * Only sets defaults if no preferences exist
 * @returns {Promise<boolean>} Whether initialization was needed
 */
export async function initializeSitePreferences() {
  try {
    const result = await chrome.storage.sync.get(["site_preferences"]);

    if (!result.site_preferences) {
      // First time user - set defaults
      await saveSitePreferences(getDefaultSitePreferences());
      console.log("[SitePrefs] Initialized default site preferences");
      return true;
    }

    return false; // Already initialized
  } catch (error) {
    console.error("[SitePrefs] Error initializing site preferences:", error);
    return false;
  }
}
