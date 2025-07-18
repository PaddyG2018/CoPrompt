import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Get current file directory for reliable imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Global storage mock state
let mockStorage = {};

// Mock chrome APIs
global.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        if (Array.isArray(keys)) {
          const result = {};
          keys.forEach((key) => {
            if (mockStorage[key] !== undefined) {
              result[key] = mockStorage[key];
            }
          });
          return result;
        }
        return mockStorage[keys] !== undefined
          ? { [keys]: mockStorage[keys] }
          : {};
      },
      set: async (data) => {
        mockStorage = { ...mockStorage, ...data };
        return Promise.resolve();
      },
      remove: async (keys) => {
        if (Array.isArray(keys)) {
          keys.forEach((key) => delete mockStorage[key]);
        } else {
          delete mockStorage[keys];
        }
        return Promise.resolve();
      },
    },
  },
  runtime: {
    sendMessage: async (_message) => {
      return { success: true };
    },
  },
};

// Mock fetch for testing token refresh
global.fetch = async (url, _options) => {
  if (url.includes("/auth/v1/token")) {
    return {
      ok: true,
      json: async () => ({
        access_token: "new_access_token",
        refresh_token: "new_refresh_token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        user: { id: "test-user" },
      }),
    };
  }
  return { ok: false };
};

describe("SessionManager", () => {
  let SessionManager;
  let sessionManager;

  beforeEach(async () => {
    // Import SessionManager dynamically inside the test
    if (!SessionManager) {
      const sessionManagerPath = join(
        __dirname,
        "../../utils/sessionManager.js",
      );
      const sessionManagerModule = await import(sessionManagerPath);
      SessionManager = sessionManagerModule.SessionManager;

      if (!SessionManager) {
        throw new Error("SessionManager not found in module exports");
      }
    }

    // Reset mock storage
    mockStorage = {
      supabase_session: {
        access_token: "valid_token",
        refresh_token: "refresh_token",
        expires_at: Math.floor(Date.now() / 1000) + 600, // 10 minutes from now
      },
    };

    sessionManager = new SessionManager();
    sessionManager.debug = false; // Disable debug logging in tests

    // Reset any static state
    sessionManager.refreshInProgress = false;
    sessionManager.refreshPromise = null;
    sessionManager.consecutiveFailures = 0;
    sessionManager.circuitBreakerResetTime = null;

    // Reset fetch mock
    global.fetch = async (url, _options) => {
      if (url.includes("/auth/v1/token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "new_access_token",
            refresh_token: "new_refresh_token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            user: { id: "test-user" },
          }),
        };
      }
      return { ok: false };
    };
  });

  test("should return valid session when not expired", async () => {
    const result = await sessionManager.ensureValidSession();

    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.session.access_token, "string");
    assert.strictEqual(result.session.access_token, "valid_token");
  });

  test("should detect and refresh expired session", async () => {
    // Set expired session in mock storage
    mockStorage.supabase_session = {
      access_token: "expired_token",
      refresh_token: "refresh_token",
      expires_at: Math.floor(Date.now() / 1000) - 100, // Expired 100 seconds ago
    };

    const result = await sessionManager.ensureValidSession();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.session.access_token, "new_access_token");
  });

  test("should detect and refresh session near expiry", async () => {
    // Set session expiring within buffer time
    mockStorage.supabase_session = {
      access_token: "near_expiry_token",
      refresh_token: "refresh_token",
      expires_at: Math.floor(Date.now() / 1000) + 60, // 1 minute from now (within 5-minute buffer)
    };

    const result = await sessionManager.ensureValidSession();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.session.access_token, "new_access_token");
  });

  test("should force refresh token successfully", async () => {
    const result = await sessionManager.forceRefresh();

    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.session.access_token, "string");
    assert.strictEqual(result.session.access_token, "new_access_token");
  });

  test("should handle refresh failure and implement circuit breaker", async () => {
    // Mock failed refresh
    global.fetch = async () => ({ ok: false, status: 401 });

    // First failure
    let result = await sessionManager.forceRefresh();
    assert.strictEqual(result.success, false);
    assert.strictEqual(sessionManager.consecutiveFailures, 1);

    // Second failure
    result = await sessionManager.forceRefresh();
    assert.strictEqual(result.success, false);
    assert.strictEqual(sessionManager.consecutiveFailures, 2);

    // Third failure - should trigger circuit breaker
    result = await sessionManager.forceRefresh();
    assert.strictEqual(result.success, false);
    assert.strictEqual(sessionManager.consecutiveFailures, 3);

    // Fourth attempt should be blocked by circuit breaker
    result = await sessionManager.ensureValidSession();
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes("temporarily unavailable"));
  });

  test("should prevent race conditions during concurrent refresh", async () => {
    // Set expired session
    mockStorage.supabase_session = {
      access_token: "expired_token",
      refresh_token: "refresh_token",
      expires_at: Math.floor(Date.now() / 1000) - 100,
    };

    // Add delay to fetch to simulate slower network
    global.fetch = async (url, _options) => {
      if (url.includes("/auth/v1/token")) {
        await setTimeout(100); // Small delay
        return {
          ok: true,
          json: async () => ({
            access_token: "new_access_token",
            refresh_token: "new_refresh_token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            user: { id: "test-user" },
          }),
        };
      }
      return { ok: false };
    };

    // Start multiple refresh operations simultaneously
    const promises = [
      sessionManager.ensureValidSession(),
      sessionManager.ensureValidSession(),
      sessionManager.ensureValidSession(),
    ];

    const results = await Promise.all(promises);

    // All should succeed and return the same session
    results.forEach((result) => {
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.session.access_token, "new_access_token");
    });
  });

  test("should handle missing session gracefully", async () => {
    // Clear session from mock storage
    mockStorage = {};

    const result = await sessionManager.ensureValidSession();
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.requiresAuth, true);
    assert.ok(result.error.includes("Authentication required"));
  });

  test("should handle malformed session data", async () => {
    // Set malformed session
    mockStorage.supabase_session = null;

    const result = await sessionManager.ensureValidSession();
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.requiresAuth, true);
  });

  test("should clear session successfully", async () => {
    await sessionManager.clearSession();

    assert.strictEqual(mockStorage.supabase_session, undefined);
  });

  test("should get current session without validation", async () => {
    const result = await sessionManager.getCurrentSession();

    assert.strictEqual(typeof result, "object");
    assert.strictEqual(result.access_token, "valid_token");
  });

  test("should handle network timeouts during refresh", async () => {
    // Mock timeout
    global.fetch = async () => {
      await setTimeout(100);
      throw new Error("Timeout");
    };

    const result = await sessionManager.forceRefresh();
    assert.strictEqual(result.success, false);
    // Check for any reasonable error message
    assert.ok(result.error && result.error.length > 0);
  });

  test("should reset circuit breaker after timeout period", async () => {
    // Mock failed refresh to trigger circuit breaker
    global.fetch = async () => ({ ok: false, status: 500 });

    // Trigger circuit breaker
    await sessionManager.forceRefresh();
    await sessionManager.forceRefresh();
    await sessionManager.forceRefresh();

    // Verify circuit breaker is active
    assert.strictEqual(sessionManager.consecutiveFailures, 3);

    // Simulate timeout period passing by setting reset time in the past
    sessionManager.circuitBreakerResetTime = Date.now() - 10000; // 10 seconds ago

    // Mock successful refresh
    global.fetch = async (url) => {
      if (url.includes("/auth/v1/token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "recovered_token",
            refresh_token: "recovered_refresh_token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            user: { id: "test-user" },
          }),
        };
      }
      return { ok: false };
    };

    const result = await sessionManager.forceRefresh();
    assert.strictEqual(result.success, true);
    // After successful refresh, failures should be reset
    assert.strictEqual(sessionManager.consecutiveFailures, 0);
  });

  test("should handle refresh token rotation correctly", async () => {
    // Mock refresh that returns new refresh token
    global.fetch = async (url) => {
      if (url.includes("/auth/v1/token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "rotated_access_token",
            refresh_token: "rotated_refresh_token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            user: { id: "test-user" },
          }),
        };
      }
      return { ok: false };
    };

    const result = await sessionManager.forceRefresh();

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.session.access_token, "rotated_access_token");
    assert.strictEqual(result.session.refresh_token, "rotated_refresh_token");

    // Verify new tokens were saved to storage
    assert.strictEqual(
      mockStorage.supabase_session.refresh_token,
      "rotated_refresh_token",
    );
  });
});
