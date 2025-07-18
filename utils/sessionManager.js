/**
 * CoPrompt Session Manager
 * 
 * Centralizes all session management operations including:
 * - Session validation with expiry checking (5-minute buffer)
 * - Automatic token refresh with exponential backoff
 * - Race condition prevention for concurrent requests
 * - Circuit breaker pattern for failed refreshes
 * - Comprehensive error handling and logging
 * 
 * Usage:
 *   const sessionManager = new SessionManager();
 *   const result = await sessionManager.ensureValidSession();
 *   if (result.success) {
 *     // Use result.session for API calls
 *   } else {
 *     // Handle authentication failure
 *   }
 */

export class SessionManager {
  constructor() {
    // State management
    this.refreshInProgress = false;
    this.refreshPromise = null;
    
    // Circuit breaker
    this.consecutiveFailures = 0;
    this.maxFailures = 3;
    this.circuitBreakerTimeout = 5 * 60 * 1000; // 5 minutes
    this.circuitBreakerResetTime = null;
    
    // Configuration
    this.expiryBuffer = 5 * 60; // 5 minutes in seconds
    this.storageKey = "supabase_session";
    
    // Supabase configuration (matching existing setup)
    this.supabaseUrl = "https://evfuyrixpjgfytwfijpx.supabase.co";
    this.supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZnV5cml4cGpnZnl0d2ZpanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODA0MDIsImV4cCI6MjA1OTY1NjQwMn0.GD6oTrvjKMdqSK4LgyRmD0E1k0zbKFg79sAlXy-fLyc";
    
    // Logging
    this.debug = true; // Can be configured
  }

  /**
   * Main method to ensure a valid session is available
   * Handles all scenarios: valid session, expired session needing refresh, no session
   * 
   * @returns {Promise<{success: boolean, session?: object, error?: string, requiresAuth?: boolean}>}
   */
  async ensureValidSession() {
    try {
      this._log("ensureValidSession", "Starting session validation");
      
      // Check circuit breaker
      if (this._isCircuitBreakerOpen()) {
        this._log("ensureValidSession", "Circuit breaker is open, failing fast");
        return {
          success: false,
          error: "Authentication service temporarily unavailable. Please try again later.",
          requiresAuth: true
        };
      }
      
      // If refresh is already in progress, wait for it
      if (this.refreshInProgress && this.refreshPromise) {
        this._log("ensureValidSession", "Refresh already in progress, waiting for result");
        return await this.refreshPromise;
      }
      
      // Get current session from storage
      const storedSession = await this._getStoredSession();
      if (!storedSession) {
        this._log("ensureValidSession", "No session found in storage");
        return {
          success: false,
          error: "Authentication required. Please sign up to get 25 free credits.",
          requiresAuth: true
        };
      }
      
      // Check if session is valid and not expired/expiring soon
      const validationResult = this._validateSession(storedSession);
      if (validationResult.isValid) {
        this._log("ensureValidSession", "Session is valid and not expiring soon");
        return {
          success: true,
          session: storedSession
        };
      }
      
      // Session needs refresh
      if (validationResult.needsRefresh) {
        this._log("ensureValidSession", "Session needs refresh, attempting automatic refresh");
        return await this._performRefresh(storedSession);
      }
      
      // Session is invalid
      this._log("ensureValidSession", "Session is invalid", validationResult.reason);
      await this._clearSession();
      return {
        success: false,
        error: "Invalid session. Please log in again.",
        requiresAuth: true
      };
      
    } catch (error) {
      this._log("ensureValidSession", "Unexpected error", error);
      return {
        success: false,
        error: "Session validation failed. Please try again.",
        requiresAuth: true
      };
    }
  }

  /**
   * Validates session structure and expiry timing
   * 
   * @param {object} session - The session object to validate
   * @returns {object} Validation result with isValid, needsRefresh, and reason
   */
  _validateSession(session) {
    // Check session structure
    if (!session || typeof session !== 'object') {
      return { isValid: false, needsRefresh: false, reason: "Session is null or not an object" };
    }
    
    if (!session.access_token || !session.refresh_token) {
      return { isValid: false, needsRefresh: false, reason: "Missing access_token or refresh_token" };
    }
    
    // Check expiry
    if (!session.expires_at) {
      return { isValid: false, needsRefresh: false, reason: "Missing expires_at" };
    }
    
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at;
    
    // Already expired
    if (expiresAt <= now) {
      return { isValid: false, needsRefresh: true, reason: "Session already expired" };
    }
    
    // Expires within buffer time (needs proactive refresh)
    if (expiresAt <= (now + this.expiryBuffer)) {
      return { isValid: false, needsRefresh: true, reason: "Session expires within buffer time" };
    }
    
    // Session is valid
    return { isValid: true, needsRefresh: false, reason: "Session is valid" };
  }

  /**
   * Performs token refresh with race condition protection
   * 
   * @param {object} currentSession - The current session to refresh
   * @returns {Promise<object>} Refresh result
   */
  async _performRefresh(currentSession) {
    // Prevent multiple concurrent refreshes
    if (this.refreshInProgress) {
      this._log("_performRefresh", "Refresh already in progress, returning existing promise");
      return this.refreshPromise;
    }
    
    this.refreshInProgress = true;
    this.refreshPromise = this._doRefresh(currentSession);
    
    try {
      const result = await this.refreshPromise;
      
      // Reset circuit breaker on success
      if (result.success) {
        this.consecutiveFailures = 0;
        this.circuitBreakerResetTime = null;
      } else {
        this._handleRefreshFailure();
      }
      
      return result;
    } finally {
      this.refreshInProgress = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Actual refresh implementation with retry logic
   * 
   * @param {object} currentSession - The current session to refresh
   * @returns {Promise<object>} Refresh result
   */
  async _doRefresh(currentSession) {
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this._log("_doRefresh", `Refresh attempt ${attempt}/${maxRetries}`);
        
        // Add exponential backoff for retries
        if (attempt > 1) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          this._log("_doRefresh", `Waiting ${delay}ms before retry`);
          await this._delay(delay);
        }
        
        // Call Supabase token refresh endpoint
        const response = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.supabaseAnonKey,
            'Authorization': `Bearer ${this.supabaseAnonKey}`
          },
          body: JSON.stringify({
            refresh_token: currentSession.refresh_token
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.msg || errorData.message || `HTTP ${response.status}`;
          throw new Error(`Token refresh failed: ${errorMessage}`);
        }
        
        const refreshedData = await response.json();
        
        // Validate refresh response
        if (!refreshedData.access_token || !refreshedData.refresh_token) {
          throw new Error("Invalid refresh response: missing tokens");
        }
        
        // Create new session object
        const newSession = {
          access_token: refreshedData.access_token,
          refresh_token: refreshedData.refresh_token,
          token_type: refreshedData.token_type || 'bearer',
          expires_in: refreshedData.expires_in,
          expires_at: refreshedData.expires_at || (Math.floor(Date.now() / 1000) + refreshedData.expires_in),
          user: refreshedData.user || currentSession.user
        };
        
        // Store the new session
        await this._storeSession(newSession);
        
        this._log("_doRefresh", "Token refresh successful");
        return {
          success: true,
          session: newSession
        };
        
      } catch (error) {
        this._log("_doRefresh", `Refresh attempt ${attempt} failed`, error.message);
        lastError = error;
        
        // Don't retry on authentication errors
        if (error.message.includes('invalid_grant') || error.message.includes('refresh_token')) {
          this._log("_doRefresh", "Authentication error, clearing session and not retrying");
          await this._clearSession();
          return {
            success: false,
            error: "Session expired. Please log in again.",
            requiresAuth: true
          };
        }
      }
    }
    
    // All retries failed
    this._log("_doRefresh", "All refresh attempts failed", lastError?.message);
    return {
      success: false,
      error: "Failed to refresh session. Please log in again.",
      requiresAuth: true
    };
  }

  /**
   * Circuit breaker management
   */
  _handleRefreshFailure() {
    this.consecutiveFailures++;
    this._log("_handleRefreshFailure", `Consecutive failures: ${this.consecutiveFailures}/${this.maxFailures}`);
    
    if (this.consecutiveFailures >= this.maxFailures) {
      this.circuitBreakerResetTime = Date.now() + this.circuitBreakerTimeout;
      this._log("_handleRefreshFailure", "Circuit breaker opened");
    }
  }

  _isCircuitBreakerOpen() {
    if (this.circuitBreakerResetTime === null) {
      return false;
    }
    
    if (Date.now() >= this.circuitBreakerResetTime) {
      this._log("_isCircuitBreakerOpen", "Circuit breaker reset time reached, closing circuit breaker");
      this.circuitBreakerResetTime = null;
      this.consecutiveFailures = 0;
      return false;
    }
    
    return true;
  }

  /**
   * Storage operations
   */
  async _getStoredSession() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      return result[this.storageKey] || null;
    } catch (error) {
      this._log("_getStoredSession", "Error retrieving session from storage", error);
      return null;
    }
  }

  async _storeSession(session) {
    try {
      await chrome.storage.local.set({ [this.storageKey]: session });
      this._log("_storeSession", "Session stored successfully");
    } catch (error) {
      this._log("_storeSession", "Error storing session", error);
      throw error;
    }
  }

  async _clearSession() {
    try {
      await chrome.storage.local.remove(this.storageKey);
      this._log("_clearSession", "Session cleared from storage");
    } catch (error) {
      this._log("_clearSession", "Error clearing session", error);
    }
  }

  /**
   * Utility methods
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _log(method, message, data = null) {
    if (!this.debug) return;
    
    const timestamp = new Date().toISOString();
    const logMessage = `[SessionManager.${method}] ${message}`;
    
    if (data) {
      console.log(`${timestamp} ${logMessage}`, data);
    } else {
      console.log(`${timestamp} ${logMessage}`);
    }
  }

  /**
   * Public method to manually clear session (for logout)
   */
  async clearSession() {
    this._log("clearSession", "Manual session clear requested");
    await this._clearSession();
    
    // Reset circuit breaker state
    this.consecutiveFailures = 0;
    this.circuitBreakerResetTime = null;
  }

  /**
   * Get current session without validation (for read-only operations)
   */
  async getCurrentSession() {
    return await this._getStoredSession();
  }

  /**
   * Force refresh current session (for testing or manual refresh)
   */
  async forceRefresh() {
    const currentSession = await this._getStoredSession();
    if (!currentSession) {
      return {
        success: false,
        error: "No session to refresh",
        requiresAuth: true
      };
    }
    
    return await this._performRefresh(currentSession);
  }

  /**
   * Get session manager status for debugging
   */
  getStatus() {
    return {
      refreshInProgress: this.refreshInProgress,
      consecutiveFailures: this.consecutiveFailures,
      circuitBreakerOpen: this._isCircuitBreakerOpen(),
      circuitBreakerResetTime: this.circuitBreakerResetTime
    };
  }
}

// Export singleton instance for convenience
export const sessionManager = new SessionManager();

// For CommonJS compatibility in background scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SessionManager, sessionManager };
} 