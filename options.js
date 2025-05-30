document.addEventListener("DOMContentLoaded", () => {
  console.log("CoPrompt Options: DOM Content Loaded.");

  const apiKeyInput = document.getElementById("apiKey");
  const saveButton = document.getElementById("saveButton");
  const clearButton = document.getElementById("clearButton");
  const statusDiv = document.getElementById("status");
  // Modal elements
  const modal = document.getElementById("clearConfirmationModal");
  const confirmClearBtn = document.getElementById("confirmClearBtn");
  const cancelClearBtn = document.getElementById("cancelClearBtn");

  // --- Token Usage Elements ---
  const totalPromptTokensEl = document.getElementById("totalPromptTokens");
  const totalCompletionTokensEl = document.getElementById(
    "totalCompletionTokens",
  );
  const totalTokensAllTimeEl = document.getElementById("totalTokensAllTime");
  const lastUsageUpdateEl = document.getElementById("lastUsageUpdate");
  const refreshUsageButton = document.getElementById("refreshUsageButton");

  // --- Auth UI Elements (PX-07) ---
  const userStatusEl = document.getElementById("userStatus");
  const userEmailEl = document.getElementById("userEmail");
  const authForm = document.getElementById("authForm"); // The div containing email/password inputs and auth buttons
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const signUpButton = document.getElementById("signUpButton");
  const loginButton = document.getElementById("loginButton");
  const logoutButton = document.getElementById("logoutButton");
  const authStatusDiv = document.getElementById("authStatus"); // For auth-related messages

  // --- Supabase Client Initialization (PX-07) ---
  // const SUPABASE_URL = "https://evfuyrixpjgfytwfijpx.supabase.co"; // LIVE - COMMENTED OUT FOR LOCAL DEV
  // const SUPABASE_ANON_KEY = // LIVE - COMMENTED OUT FOR LOCAL DEV
  //   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZnV5cml4cGpnZnl0d2ZpanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODA0MDIsImV4cCI6MjA1OTY1NjQwMn0.GD6oTrvjKMdqSK4LgyRmD0E1k0zbKFg79sAlXy-fLyc";

  // TEMPORARY: Point to local Supabase for testing - REVERTED // Now ACTIVE for local dev
  const SUPABASE_URL = "http://127.0.0.1:54321";
  const SUPABASE_ANON_KEY = 
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

  let supabaseClient = null; // Renamed for clarity
  if (window.supabase) {
    try {
      const { createClient } = window.supabase; // Destructure createClient from the global supabase object
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log("Supabase client initialized successfully.");
    } catch (error) {
      console.error("Error initializing Supabase client:", error);
      if (authStatusDiv) {
        // Check if element exists before using it
        authStatusDiv.textContent =
          "Error initializing auth service. Features may be limited.";
        authStatusDiv.className = "status error";
        authStatusDiv.style.display = "block";
      }
    }
  } else {
    console.error("Supabase client library not loaded.");
    if (authStatusDiv) {
      authStatusDiv.textContent =
        "Auth service library not loaded. Features may be limited.";
      authStatusDiv.className = "status error";
      authStatusDiv.style.display = "block";
    }
  }

  // Load saved API Key
  chrome.storage.local.get("openai_api_key", (data) => {
    if (data.openai_api_key) {
      // We don't actually show the decrypted key for security
      apiKeyInput.placeholder = "API key is set (hidden for security)";
    }
  });

  // Save API Key
  if (saveButton) {
    console.log("CoPrompt Options: Adding listener to Save button.");
    saveButton.addEventListener("click", async function () {
      const apiKey = apiKeyInput.value.trim();

      if (!apiKey) {
        showStatus("Please enter your OpenAI API key.", "error");
        return;
      }

      // Basic validation
      if (!apiKey.startsWith("sk-") || apiKey.length < 20) {
        showStatus(
          'Invalid API key format. It should start with "sk-" and be longer.',
          "error",
        );
        return;
      }

      // PX-08: If user is logged in, save to server. Otherwise, save locally.
      if (supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
          // User is logged in, call Edge Function
          try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/store-user-api-key`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': SUPABASE_ANON_KEY // Supabase Edge Functions might need this
              },
              body: JSON.stringify({ apiKey: apiKey })
            });

            if (response.ok) {
              showStatus("API key securely stored in your account!", "success");
              apiKeyInput.value = "";
              apiKeyInput.placeholder = "API key is set in your account (hidden)";
            } else {
              const errorData = await response.json().catch(() => ({ message: 'Failed to store API key.' }));
              showStatus(`Error storing API key: ${errorData.message || response.statusText}`, "error");
            }
          } catch (error) {
            console.error("Error calling store-user-api-key function:", error);
            showStatus("Error storing API key: " + (error.message || "Network error"), "error");
          }
          return; // Exit after handling logged-in case
        }
      }

      // Fallback for non-logged-in users (original behavior)
      chrome.runtime.sendMessage(
        { type: "SAVE_API_KEY", apiKey: apiKey },
        function (response) {
          if (response.success) {
            showStatus("API key saved successfully (locally)!", "success");
            apiKeyInput.value = "";
            apiKeyInput.placeholder = "API key is set (hidden for security)";
          } else {
            showStatus(
              "Error saving API key: " + (response.error || "Unknown error"),
              "error",
            );
          }
        },
      );
    });
  } else {
    console.error("CoPrompt Options: Save button not found!");
  }

  // Clear API Key (with confirmation)
  if (clearButton) {
    console.log("CoPrompt Options: Adding listener to Clear button.");
    clearButton.addEventListener("click", function () {
      console.log("CoPrompt Options: Clear button clicked - showing modal.");
      // Show the custom modal instead of alert/confirm
      if (modal) {
        modal.style.display = "flex"; // Use flex to enable centering
      }
    });
  } else {
    console.error("CoPrompt Options: Clear button not found!");
  }

  // Modal Actions
  if (confirmClearBtn) {
    confirmClearBtn.addEventListener("click", async function () {
      console.log("CoPrompt Options: Modal Confirm clicked, clearing key...");

      // PX-08: If user is logged in, clear from server. Otherwise, clear locally.
      if (supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
          // User is logged in, call Edge Function to clear/delete key
          try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/store-user-api-key`, {
              method: 'POST', // Or DELETE, if function supports it. Assuming POST with apiKey: null
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': SUPABASE_ANON_KEY
              },
              body: JSON.stringify({ apiKey: null }) // Convention for deletion
            });

            if (response.ok) {
              showStatus("API key cleared from your account.", "success");
              apiKeyInput.value = "";
              apiKeyInput.placeholder = "sk-... (will be stored in your account)";
            } else {
              const errorData = await response.json().catch(() => ({ message: 'Failed to clear API key.' }));
              showStatus(`Error clearing API key: ${errorData.message || response.statusText}`, "error");
            }
          } catch (error) {
            console.error("Error calling store-user-api-key function for clearing:", error);
            showStatus("Error clearing API key: " + (error.message || "Network error"), "error");
          }
          if (modal) modal.style.display = "none"; // Hide modal
          return; // Exit after handling logged-in case
        }
      }

      // Fallback for non-logged-in users (original behavior)
      chrome.storage.local.remove("openai_api_key", function () {
        if (chrome.runtime.lastError) {
          showStatus(
            "Error clearing API key: " + chrome.runtime.lastError.message,
            "error",
          );
        } else {
          showStatus("API key cleared successfully (from local storage).", "success");
          apiKeyInput.value = ""; // Clear the input field visually
          apiKeyInput.placeholder = "sk-..."; // Restore original placeholder
        }
        // Always hide modal after action
        if (modal) {
          modal.style.display = "none";
        }
      });
    });
  }

  if (cancelClearBtn) {
    cancelClearBtn.addEventListener("click", function () {
      console.log("CoPrompt Options: Modal Cancel clicked.");
      if (modal) {
        modal.style.display = "none"; // Hide modal
      }
    });
  }

  // Function to display status messages
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = "status " + type;
    statusDiv.style.display = "block";

    setTimeout(function () {
      statusDiv.style.display = "none";
    }, 3000);
  }

  // --- Token Usage Logic ---
  async function loadAndDisplayUsageStats() {
    if (!chrome.storage || !chrome.storage.local) {
      console.error("Chrome storage API is not available.");
      if (totalPromptTokensEl) totalPromptTokensEl.textContent = "Error";
      // ... set other elements to Error too
      return;
    }

    try {
      const usageData = await chrome.storage.local.get([
        "total_prompt_tokens",
        "total_completion_tokens",
        "total_tokens_all_time",
        "last_usage_update",
      ]);

      if (totalPromptTokensEl) {
        totalPromptTokensEl.textContent = (
          usageData.total_prompt_tokens || 0
        ).toLocaleString();
      }
      if (totalCompletionTokensEl) {
        totalCompletionTokensEl.textContent = (
          usageData.total_completion_tokens || 0
        ).toLocaleString();
      }
      if (totalTokensAllTimeEl) {
        totalTokensAllTimeEl.textContent = (
          usageData.total_tokens_all_time || 0
        ).toLocaleString();
      }
      if (lastUsageUpdateEl) {
        lastUsageUpdateEl.textContent = usageData.last_usage_update
          ? new Date(usageData.last_usage_update).toLocaleString()
          : "N/A";
      }
    } catch (error) {
      console.error("Error loading token usage stats:", error);
      if (totalPromptTokensEl)
        totalPromptTokensEl.textContent = "Error loading stats";
      // Potentially update other fields to show error state
    }
  }

  if (refreshUsageButton) {
    refreshUsageButton.addEventListener("click", loadAndDisplayUsageStats);
  }

  // Initial load of usage stats
  loadAndDisplayUsageStats();

  // --- Auth Logic (PX-07) ---

  // Function to update UI based on auth state
  function updateAuthUI(user) {
    console.log("[updateAuthUI] Called with user:", user);
    console.log("[updateAuthUI] logoutButton element:", logoutButton);

    if (user) {
      if (userStatusEl) userStatusEl.textContent = "Logged In";
      if (userEmailEl) userEmailEl.textContent = user.email;
      if (authForm) authForm.style.display = "none"; // Hide login/signup form

      if (logoutButton) {
        console.log(
          "[updateAuthUI] Before setting logoutButton display (user logged in):",
          logoutButton.style.display,
        );
        logoutButton.style.display = "inline-block"; // Show logout button
        console.log(
          "[updateAuthUI] After setting logoutButton display:",
          logoutButton.style.display,
        );
      } else {
        console.error(
          "[updateAuthUI] logoutButton element not found when trying to show it.",
        );
      }

      // PX-08: Enable API key controls for logged-in users
      if (apiKeyInput) {
        apiKeyInput.disabled = false;
        // Placeholder will be updated by checkUserAPIKeyStatus
      }
      if (saveButton) saveButton.disabled = false;
      if (clearButton) clearButton.disabled = false;
    } else {
      if (userStatusEl) userStatusEl.textContent = "Not logged in";
      if (userEmailEl) userEmailEl.textContent = "N/A";
      if (authForm) authForm.style.display = "block"; // Show login/signup form

      if (logoutButton) {
        console.log(
          "[updateAuthUI] Before setting logoutButton display (user logged out):",
          logoutButton.style.display,
        );
        logoutButton.style.display = "none"; // Hide logout button
        console.log(
          "[updateAuthUI] After setting logoutButton display:",
          logoutButton.style.display,
        );
      } else {
        console.error(
          "[updateAuthUI] logoutButton element not found when trying to hide it.",
        );
      }

      if (apiKeyInput) apiKeyInput.disabled = false;
      if (saveButton) saveButton.disabled = false;
      if (clearButton) clearButton.disabled = false;
      // PX-08: For logged-out users, check local storage for key placeholder
      chrome.storage.local.get("openai_api_key", (data) => {
        if (data.openai_api_key) {
          apiKeyInput.placeholder = "API key is set (hidden for security)";
        } else {
          apiKeyInput.placeholder = "sk-...";
        }
      });
    }
  }

  // Show auth status messages
  function showAuthStatus(message, type) {
    if (authStatusDiv) {
      authStatusDiv.textContent = message;
      authStatusDiv.className = "status " + type; // Reuse existing styling
      authStatusDiv.style.display = "block";
      setTimeout(() => {
        authStatusDiv.style.display = "none";
      }, 3000);
    }
  }

  // Sign Up
  if (signUpButton && supabaseClient) {
    signUpButton.addEventListener("click", async () => {
      const email = emailInput.value;
      const password = passwordInput.value;
      if (!email || !password) {
        showAuthStatus("Email and password are required.", "error");
        return;
      }
      try {
        const { data, error } = await supabaseClient.auth.signUp({
          email: email,
          password: password,
        });
        if (error) {
          console.error("Sign up error:", error);
          showAuthStatus(`Sign up failed: ${error.message}`, "error");
          return;
        }
        // data.user will be null if email confirmation is required and not turned off in Supabase settings.
        // data.session will also be null in that case.
        // If email confirmation is OFF, data.user and data.session should be populated.
        console.log(
          "Sign up successful (check Supabase dashboard & console):",
          data,
        );
        if (data.user && data.user.aud === "authenticated") {
          // User is created and authenticated (email confirmation likely off or auto-confirmed)
          showAuthStatus(
            "Sign up successful! You are now logged in.",
            "success",
          );
          updateAuthUI(data.user);
          // The onAuthStateChange listener should also pick this up and manage session.
        } else if (data.user && !data.session) {
          // User is created but requires confirmation (e.g., email verification)
          // Since we turned "Confirm email" OFF, this state might mean something else or just be the default response.
          showAuthStatus(
            "Sign up successful! Please check your email to confirm. (If applicable)",
            "success",
          );
          // updateAuthUI(null); // Or handle as a pending confirmation state if needed
        } else {
          // This case might occur if the user object exists but there's no session and no clear indication of next steps
          // For now, we'll assume if there's a user, it's a success, but confirmation might be pending.
          showAuthStatus(
            "Sign up successful! Confirmation might be required.",
            "success",
          );
        }
      } catch (e) {
        console.error("Sign up exception:", e);
        showAuthStatus(
          "Sign up failed: An unexpected error occurred.",
          "error",
        );
      }
    });
  }

  // Login
  if (loginButton && supabaseClient) {
    loginButton.addEventListener("click", async () => {
      const email = emailInput.value;
      const password = passwordInput.value;
      if (!email || !password) {
        showAuthStatus("Email and password are required.", "error");
        return;
      }
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: email,
          password: password,
        });
        if (error) {
          console.error("Login error:", error);
          showAuthStatus(`Login failed: ${error.message}`, "error");
          return;
        }
        // data.user and data.session should be populated on successful login.
        console.log("Login successful:", data);
        if (data.user) {
          showAuthStatus("Login successful!", "success");
          // UI update (hiding form, showing email) will be handled by onAuthStateChange.
          emailInput.value = ""; // Clear form
          passwordInput.value = "";
        } else {
          // This case should ideally not happen if there's no error.
          showAuthStatus(
            "Login completed, but no user data returned. Please check console.",
            "error",
          );
        }
      } catch (e) {
        console.error("Login exception:", e);
        showAuthStatus("Login failed: An unexpected error occurred.", "error");
      }
    });
  }

  // Logout
  if (logoutButton && supabaseClient) {
    logoutButton.addEventListener("click", async () => {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
          console.error("Logout error:", error);
          showAuthStatus(`Logout failed: ${error.message}`, "error");
          return;
        }
        // UI update (showing form, clearing email) will be handled by onAuthStateChange.
        showAuthStatus("Logged out successfully.", "success");
        // emailInput.value = ""; // Ensure form is clear if needed, though onAuthStateChange should handle UI.
        // passwordInput.value = "";
      } catch (e) {
        console.error("Logout exception:", e);
        showAuthStatus("Logout failed: An unexpected error occurred.", "error");
      }
    });
  }

  // Listen for auth state changes (login, logout, token refreshed)
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth event:", event, "Session:", session);
      const user = session?.user || null;
      updateAuthUI(user); // Update general UI elements

      if (user) { // If there's a user (logged in or session refreshed)
        await checkUserAPIKeyStatus(session);
      } else { // User logged out
         if (apiKeyInput) apiKeyInput.placeholder = "sk-...";
      }

      // A-04: Store/remove user session
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        if (session) {
          try {
            await chrome.storage.local.set({ supabase_session: session });
            console.log(
              "Supabase session stored/updated in chrome.storage.local",
              session,
            );
          } catch (e) {
            console.error("Error storing supabase session:", e);
          }
        } else {
          // This case (SIGNED_IN with null session) should ideally not happen with email/password
          // but good to be aware of for other auth methods.
          console.warn("Auth event SIGNED_IN received, but session is null.");
          try {
            await chrome.storage.local.remove("supabase_session");
            console.log(
              "Supabase session removed from chrome.storage.local due to null session on SIGNED_IN.",
            );
          } catch (e) {
            console.error("Error removing supabase session:", e);
          }
        }
      } else if (event === "SIGNED_OUT") {
        try {
          await chrome.storage.local.remove("supabase_session");
          console.log(
            "Supabase session removed from chrome.storage.local on SIGNED_OUT.",
          );
        } catch (e) {
          console.error("Error removing supabase session:", e);
        }
      }
    });
  }

  // Check initial auth state when the page loads
  async function checkInitialAuthState() {
    if (!supabaseClient) {
      updateAuthUI(null); // Ensure UI is in logged-out state if Supabase isn't ready
      if (apiKeyInput) apiKeyInput.placeholder = "sk-..."; // Default placeholder if no Supabase
      return;
    }
    try {
      // Attempt to get current session from Supabase client (might involve a fetch if tokens need refresh)
      const {
        data: { session },
        error,
      } = await supabaseClient.auth.getSession();

      if (error) {
        console.error(
          "Error getting initial session from Supabase client:",
          error.message,
        );
        // If getSession fails, try to see if we have a stale session in chrome.storage.local
        // This is a fallback and might indicate token expiry issues if Supabase can't refresh.
        try {
          const localData = await chrome.storage.local.get("supabase_session");
          if (localData.supabase_session) {
            console.warn(
              "Using potentially stale session from local storage after getSession() error.",
            );
            updateAuthUI(localData.supabase_session.user);
            await checkUserAPIKeyStatus(localData.supabase_session); // Check key status with this session
          } else {
            updateAuthUI(null);
            if (apiKeyInput) apiKeyInput.placeholder = "sk-...";
          }
        } catch (e) {
          console.error(
            "Error reading session from chrome.storage.local during fallback:",
            e,
          );
          updateAuthUI(null);
          if (apiKeyInput) apiKeyInput.placeholder = "sk-...";
        }
        return;
      }

      console.log("Initial session from Supabase client:", session);
      updateAuthUI(session?.user || null);

      if (session && session.user) {
        await checkUserAPIKeyStatus(session);
      } else {
        // If not logged in, ensure local placeholder is set based on local storage
        chrome.storage.local.get("openai_api_key", (data) => {
            if (apiKeyInput) { // Ensure apiKeyInput is available
                if (data.openai_api_key) {
                    apiKeyInput.placeholder = "API key is set (hidden for security)";
                } else {
                    apiKeyInput.placeholder = "sk-...";
                }
            }
        });
      }

      // Sync chrome.storage.local with the session state from Supabase client
      if (session) {
        try {
          await chrome.storage.local.set({ supabase_session: session });
          console.log("Initial session synced to chrome.storage.local.");
        } catch (e) {
          console.error(
            "Error storing initial session to chrome.storage.local:",
            e,
          );
        }
      } else {
        try {
          await chrome.storage.local.remove("supabase_session");
          console.log(
            "Initial check found no active session, ensured chrome.storage.local is clear.",
          );
        } catch (e) {
          console.error(
            "Error removing session from chrome.storage.local during initial check:",
            e,
          );
        }
      }
    } catch (e) {
      console.error("Exception in checkInitialAuthState:", e);
      updateAuthUI(null); // Default to logged-out state on any unexpected error
    }
  }

  // Call checkInitialAuthState when the script loads and Supabase client is available
  if (supabaseClient) {
    checkInitialAuthState();
  } else {
    // If supabaseClient is not yet initialized (e.g. lib not loaded), ensure UI is logged out.
    // This is a fallback, the main check runs if/when supabaseClient initializes.
    updateAuthUI(null);
    console.warn(
      "Supabase client not available at initial check time. UI set to logged out.",
    );
    // PX-08 Ensure placeholder is sensible if Supabase client isn't loaded
    if (apiKeyInput) {
        chrome.storage.local.get("openai_api_key", (data) => {
            if (data.openai_api_key) {
                apiKeyInput.placeholder = "API key is set (hidden for security)";
            } else {
                apiKeyInput.placeholder = "sk-...";
            }
        });
    }
  }

  // PX-08: Function to check user's API key status from the server
  async function checkUserAPIKeyStatus(session) {
    if (!session || !session.user || !supabaseClient || !apiKeyInput) {
      if (apiKeyInput && !(session && session.user)) {
        // If no session/user, default to standard placeholder or check local storage
         chrome.storage.local.get("openai_api_key", (data) => {
            if (data.openai_api_key) {
                apiKeyInput.placeholder = "API key is set (hidden for security)";
            } else {
                apiKeyInput.placeholder = "sk-...";
            }
        });
      }
      return;
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/store-user-api-key`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.hasKey) {
          apiKeyInput.placeholder = "API key is set in your account (hidden)";
        } else {
          apiKeyInput.placeholder = "sk-... (will be stored in your account)";
        }
      } else {
        // Error fetching status, maybe assume no key or keep a generic placeholder
        console.warn("Could not fetch API key status from server. Response status:", response.status);
        apiKeyInput.placeholder = "sk-... (will be stored in your account)";
      }
    } catch (error) {
      console.error("Error calling store-user-api-key (GET for status):", error);
      apiKeyInput.placeholder = "sk-... (will be stored in your account)"; // Fallback placeholder
    }
  }
});
