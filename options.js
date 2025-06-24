document.addEventListener("DOMContentLoaded", () => {
  console.log("CoPrompt Options: DOM Content Loaded.");

  const statusDiv = document.getElementById("status");

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

  // --- V2 Credit Display Elements ---
  const creditsBalanceEl = document.getElementById("creditsBalance");
  const refreshCreditsButton = document.getElementById("refreshCreditsButton");

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
      if (totalCompletionTokensEl) totalCompletionTokensEl.textContent = "Error";
      if (totalTokensAllTimeEl) totalTokensAllTimeEl.textContent = "Error";
      return;
    }

    try {
      // V2: Load from new token_usage_log format
      const result = await chrome.storage.local.get("token_usage_log");
      const usageLog = result.token_usage_log || [];
      
      if (usageLog.length > 0) {
        // Calculate totals from log entries
        const totals = usageLog.reduce((acc, entry) => {
          acc.prompt_tokens += entry.prompt_tokens || 0;
          acc.completion_tokens += entry.completion_tokens || 0;
          acc.total_tokens += entry.total_tokens || 0;
          return acc;
        }, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });

        if (totalPromptTokensEl) {
          totalPromptTokensEl.textContent = totals.prompt_tokens.toLocaleString();
        }
        if (totalCompletionTokensEl) {
          totalCompletionTokensEl.textContent = totals.completion_tokens.toLocaleString();
        }
        if (totalTokensAllTimeEl) {
          totalTokensAllTimeEl.textContent = totals.total_tokens.toLocaleString();
        }
        if (lastUsageUpdateEl) {
          const lastEntry = usageLog[usageLog.length - 1];
          lastUsageUpdateEl.textContent = new Date(lastEntry.timestamp).toLocaleString();
        }
      } else {
        // No usage data
        if (totalPromptTokensEl) totalPromptTokensEl.textContent = "0";
        if (totalCompletionTokensEl) totalCompletionTokensEl.textContent = "0";
        if (totalTokensAllTimeEl) totalTokensAllTimeEl.textContent = "0";
        if (lastUsageUpdateEl) lastUsageUpdateEl.textContent = "N/A";
      }
    } catch (error) {
      console.error("Error loading token usage stats:", error);
      if (totalPromptTokensEl)
        totalPromptTokensEl.textContent = "Error loading stats";
      if (totalCompletionTokensEl)
        totalCompletionTokensEl.textContent = "Error loading stats";
      if (totalTokensAllTimeEl)
        totalTokensAllTimeEl.textContent = "Error loading stats";
    }
  }

  if (refreshUsageButton) {
    refreshUsageButton.addEventListener("click", loadAndDisplayUsageStats);
  }

  // Initial load of usage stats
  loadAndDisplayUsageStats();

  // --- V2 Credits Logic ---
  async function loadAndDisplayCredits() {
    if (!supabaseClient) {
      if (creditsBalanceEl) creditsBalanceEl.textContent = "Auth service unavailable";
      return;
    }

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session || !session.user) {
        if (creditsBalanceEl) creditsBalanceEl.textContent = "Please log in to view credits";
        return;
      }

      // Query user_profiles for credit balance
      const { data: profile, error } = await supabaseClient
        .from('user_profiles')
        .select('balance')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error("Error fetching user credits:", error);
        if (creditsBalanceEl) creditsBalanceEl.textContent = "Error loading credits";
        return;
      }

      if (creditsBalanceEl) {
        creditsBalanceEl.textContent = profile?.balance || 0;
      }
    } catch (error) {
      console.error("Error loading credits:", error);
      if (creditsBalanceEl) creditsBalanceEl.textContent = "Error loading credits";
    }
  }

  if (refreshCreditsButton) {
    refreshCreditsButton.addEventListener("click", loadAndDisplayCredits);
  }

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

      // Load credits for logged-in users
      loadAndDisplayCredits();
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

      // Clear credits display for logged-out users
      if (creditsBalanceEl) creditsBalanceEl.textContent = "Please log in";
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
        
        console.log("Sign up successful:", data);
        if (data.user && !data.session) {
          showAuthStatus("Sign up successful! Please check your email to confirm your account.", "success");
        } else if (data.session) {
          showAuthStatus("Sign up successful! You are now logged in.", "success");
          updateAuthUI(data.user);
          // Store session for background script access
          await chrome.storage.local.set({ supabase_session: data.session });
        }
        
        // Clear form
        emailInput.value = "";
        passwordInput.value = "";
      } catch (error) {
        console.error("Sign up error:", error);
        showAuthStatus(`Sign up failed: ${error.message}`, "error");
      }
    });
  }

  // Log In
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
        console.log("Login successful:", data);
        showAuthStatus("Login successful!", "success");
        updateAuthUI(data.user);
        
        // Store session for background script access
        await chrome.storage.local.set({ supabase_session: data.session });
        
        // Clear form
        emailInput.value = "";
        passwordInput.value = "";
      } catch (error) {
        console.error("Login error:", error);
        showAuthStatus(`Login failed: ${error.message}`, "error");
      }
    });
  }

  // Log Out
  if (logoutButton && supabaseClient) {
    logoutButton.addEventListener("click", async () => {
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
          console.error("Logout error:", error);
          showAuthStatus(`Logout failed: ${error.message}`, "error");
          return;
        }
        console.log("Logout successful");
        showAuthStatus("Logged out successfully!", "success");
        updateAuthUI(null);
        
        // Clear stored session
        await chrome.storage.local.remove("supabase_session");
      } catch (error) {
        console.error("Logout error:", error);
        showAuthStatus(`Logout failed: ${error.message}`, "error");
      }
    });
  }

  // Set up auth listener
  if (supabaseClient) {
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user);
      
      if (session) {
        updateAuthUI(session.user);
        // Store session for background script access
        await chrome.storage.local.set({ supabase_session: session });
      } else {
        updateAuthUI(null);
        // Clear stored session
        await chrome.storage.local.remove("supabase_session");
      }
    });
  }

  // Check initial auth state
  async function checkInitialAuthState() {
    if (!supabaseClient) {
      console.log("Supabase client not available, skipping auth check.");
      return;
    }
    
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error) {
        console.error("Error getting session:", error);
        showAuthStatus("Error checking login status.", "error");
        return;
      }
      
      console.log("Initial session check:", session?.user);
      if (session && session.user) {
        updateAuthUI(session.user);
        // Ensure session is stored for background script
        await chrome.storage.local.set({ supabase_session: session });
      } else {
        updateAuthUI(null);
      }
    } catch (error) {
      console.error("Error during initial auth check:", error);
      showAuthStatus("Error checking login status.", "error");
    }
  }

  // Perform initial auth check
  checkInitialAuthState();

  console.log("CoPrompt Options: All event listeners set up successfully.");
});
