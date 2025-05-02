import { logger } from "./logger.js";

// Constants for script loading
const SCRIPT_TIMEOUT = 5000; // 5 seconds timeout
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

class ScriptLoader {
  constructor() {
    this.loadedScripts = new Map();
    this.loadingScripts = new Map();
  }

  // Generate a cryptographically secure nonce
  generateNonce() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }

  // Calculate script integrity hash
  async calculateIntegrity(scriptContent) {
    const encoder = new TextEncoder();
    const data = encoder.encode(scriptContent);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return "sha256-" + btoa(String.fromCharCode(...hashArray));
  }

  // Load script with security measures
  async loadScript(scriptUrl, options = {}) {
    const {
      nonce = this.generateNonce(),
      integrity = null,
      retryCount = 0,
      timeout = SCRIPT_TIMEOUT,
    } = options;

    // Check if script is already loaded
    if (this.loadedScripts.has(scriptUrl)) {
      logger.debug("Script already loaded", { scriptUrl });
      return this.loadedScripts.get(scriptUrl);
    }

    // Check if script is currently loading
    if (this.loadingScripts.has(scriptUrl)) {
      logger.debug("Script already loading", { scriptUrl });
      return this.loadingScripts.get(scriptUrl);
    }

    // Create loading promise
    const loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.type = "module";
      script.nonce = nonce;

      if (integrity) {
        script.integrity = integrity;
      }

      // Set up timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`Script load timeout: ${scriptUrl}`));
      }, timeout);

      // Handle load success
      script.onload = () => {
        clearTimeout(timeoutId);
        this.loadedScripts.set(scriptUrl, script);
        this.loadingScripts.delete(scriptUrl);
        resolve(script);
      };

      // Handle load error
      script.onerror = (error) => {
        clearTimeout(timeoutId);
        this.loadingScripts.delete(scriptUrl);
        reject(error);
      };

      // Add to document
      document.head.appendChild(script);
    });

    // Store loading promise
    this.loadingScripts.set(scriptUrl, loadPromise);

    try {
      return await loadPromise;
    } catch (error) {
      // Handle retry logic
      if (retryCount < MAX_RETRIES) {
        logger.warn("Script load failed, retrying", {
          scriptUrl,
          retryCount: retryCount + 1,
          error: error.message,
        });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return this.loadScript(scriptUrl, {
          ...options,
          retryCount: retryCount + 1,
        });
      }
      throw error;
    }
  }

  // Load script with integrity verification
  async loadScriptWithIntegrity(scriptUrl, scriptContent) {
    try {
      const integrity = await this.calculateIntegrity(scriptContent);
      return this.loadScript(scriptUrl, { integrity });
    } catch (error) {
      logger.error("Failed to load script with integrity", {
        scriptUrl,
        error: error.message,
      });
      throw error;
    }
  }

  // Clean up loaded scripts
  cleanup() {
    this.loadedScripts.forEach((script) => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    });
    this.loadedScripts.clear();
    this.loadingScripts.clear();
  }
}

// Export singleton instance
export const scriptLoader = new ScriptLoader();
