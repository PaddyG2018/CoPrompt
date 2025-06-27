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
  const authForm = document.getElementById("authForm"); // The div containing email input and magic link button
  const emailInput = document.getElementById("emailInput");
  const sendMagicLinkButton = document.getElementById("sendMagicLinkButton");
  const logoutButton = document.getElementById("logoutButton");
  const authStatusDiv = document.getElementById("authStatus"); // For auth-related messages

  // --- V2 Credit Display Elements ---
  const creditsBalanceEl = document.getElementById("creditsBalance");
  const refreshCreditsButton = document.getElementById("refreshCreditsButton");

  // P3-02: DOM Elements for Credit Purchase
  const creditsPurchaseEl = document.getElementById("creditsPurchase");
  const purchaseStatusEl = document.getElementById("purchaseStatus");
  const packageButtons = document.querySelectorAll("button[data-package]");

  // --- Site Preferences Elements ---
  const siteTogglesContainer = document.getElementById("siteToggles");
  const saveSitePrefsButton = document.getElementById("saveSitePrefsButton");
  const resetSitePrefsButton = document.getElementById("resetSitePrefsButton");
  const sitePrefsStatusDiv = document.getElementById("sitePrefsStatus");

  // V2A-02: Handle pre-filled email from URL parameters
  function handleURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get("email");

    if (emailParam && emailInput) {
      emailInput.value = emailParam;

      // Show welcome message for new users
      if (authStatusDiv) {
        authStatusDiv.textContent = `Welcome! Please create your account with ${emailParam} to get 25 free credits.`;
        authStatusDiv.className = "status info";
        authStatusDiv.style.display = "block";
      }

      // Focus on password input since email is pre-filled
      if (passwordInput) {
        passwordInput.focus();
      }

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // Call URL parameter handler
  handleURLParameters();

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

  // Handle magic link authentication
  async function handleMagicLinkAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlHash = window.location.hash;
    
    console.log("[Options] Magic link check details:", {
      search: window.location.search,
      hash: urlHash,
      hashLength: urlHash.length,
      hasAccessToken: urlHash.includes('access_token='),
      hasRefreshToken: urlHash.includes('refresh_token='),
      hasTypeMagiclink: urlHash.includes('type=magiclink'),
      fullURL: window.location.href
    });
    
    // Check for magic link parameters in query string OR URL fragment
    const isMagicLinkQuery = urlParams.get('magic_link') === 'true';
    const isMagicLinkFragment = urlHash.includes('access_token=') || 
                                urlHash.includes('refresh_token=') || 
                                urlHash.includes('type=magiclink');
    
    console.log("[Options] Detection results:", {
      isMagicLinkQuery,
      isMagicLinkFragment,
      willProcess: isMagicLinkQuery || isMagicLinkFragment
    });
    
    if (isMagicLinkQuery || isMagicLinkFragment) {
      console.log("[Options] Handling magic link authentication", { 
        isMagicLinkQuery, 
        isMagicLinkFragment, 
        urlHash,
        supabaseClient: !!supabaseClient 
      });
      
      if (!supabaseClient) {
        console.error("[Options] Supabase client not available");
        showAuthStatus("Authentication service not available. Please refresh the page.", "error");
        return;
      }
      
      showAuthStatus("Processing magic link authentication...", "info");
      
      try {
        // If we have URL fragments, we need to manually process them
        if (isMagicLinkFragment) {
          console.log("[Options] Processing URL fragments manually...");
          
          // Parse the URL hash to extract tokens
          const hashParams = new URLSearchParams(urlHash.substring(1)); // Remove the # character
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const tokenType = hashParams.get('token_type');
          const expiresIn = hashParams.get('expires_in');
          
          console.log("[Options] URL hash details:", {
            originalHash: urlHash,
            hashWithoutSymbol: urlHash.substring(1),
            hashLength: urlHash.length,
            allHashParams: Array.from(hashParams.entries())
          });
          
          console.log("[Options] Extracted tokens:", {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            tokenType,
            expiresIn,
            accessTokenLength: accessToken?.length,
            refreshTokenLength: refreshToken?.length
          });
          
          if (accessToken && refreshToken) {
            console.log("[Options] Setting session manually with extracted tokens...");
            
            // Set the session manually using Supabase's setSession method
            const { data: { session }, error: sessionError } = await supabaseClient.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            
            console.log("[Options] Manual session result:", { 
              session: !!session, 
              user: session?.user?.email, 
              error: sessionError 
            });
            
            if (sessionError) {
              console.error("[Options] Error setting session:", sessionError);
              throw sessionError;
            }
            
            if (session && session.user) {
              console.log("[Options] Magic link authentication successful:", session.user.email);
              updateAuthUI(session.user);
              await chrome.storage.local.set({ supabase_session: session });
              
              showAuthStatus("✅ Authentication successful! You now have 25 free credits.", "success");
              
              // Load and display credits
              setTimeout(() => {
                loadAndDisplayCredits();
              }, 1000);
              
              // Clean up URL after successful authentication
              console.log("[Options] Cleaning up URL hash after success");
              window.history.replaceState({}, document.title, window.location.pathname);
              return; // Early return on success
            }
          } else {
            console.warn("[Options] Missing required tokens in URL hash");
            showAuthStatus("Invalid magic link tokens. Please try signing up manually.", "error");
          }
        }
        
        // Fallback: Try to get existing session (for query parameter method)
        console.log("[Options] Getting session from Supabase...");
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        console.log("[Options] Session result:", { session: !!session, user: session?.user?.email, error });
        
        if (error) {
          console.error("[Options] Magic link session error:", error);
          throw error;
        }
        
        if (session && session.user) {
          console.log("[Options] Magic link authentication successful:", session.user.email);
          updateAuthUI(session.user);
          await chrome.storage.local.set({ supabase_session: session });
          
          showAuthStatus("✅ Authentication successful! You now have 25 free credits.", "success");
          
          // Load and display credits
          setTimeout(() => {
            loadAndDisplayCredits();
          }, 1000);
          
        } else {
          console.warn("[Options] No session found after magic link");
          showAuthStatus("Magic link authentication failed. Please try signing up manually.", "error");
        }
        
        // Clean up URL regardless of success/failure
        if (isMagicLinkFragment) {
          // For URL fragments, clear the hash
          console.log("[Options] Cleaning up URL hash");
          window.history.replaceState({}, document.title, window.location.pathname);
        } else {
          // For query parameters, clear the search
          console.log("[Options] Cleaning up URL search");
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        
      } catch (error) {
        console.error("[Options] Magic link auth error:", error);
        showAuthStatus("Authentication error: " + (error.message || "Please try again."), "error");
        
        // Clean up URL on error too
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else {
      console.log("[Options] No magic link parameters detected");
    }
  }

  // Make function globally accessible for debugging
  window.handleMagicLinkAuth = handleMagicLinkAuth;

  // --- Supabase Client Initialization (PX-07) ---
  const SUPABASE_URL = "https://evfuyrixpjgfytwfijpx.supabase.co"; // LIVE - NOW ACTIVE
  const SUPABASE_ANON_KEY = // LIVE - NOW ACTIVE
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZnV5cml4cGpnZnl0d2ZpanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODA0MDIsImV4cCI6MjA1OTY1NjQwMn0.GD6oTrvjKMdqSK4LgyRmD0E1k0zbKFg79sAlXy-fLyc";

  // TEMPORARY: Point to local Supabase for testing - COMMENTED OUT FOR LIVE
  // const SUPABASE_URL = "http://127.0.0.1:54321";
  // const SUPABASE_ANON_KEY =
  //   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

  let supabaseClient = null; // Renamed for clarity
  if (window.supabase) {
    try {
      const { createClient } = window.supabase; // Destructure createClient from the global supabase object
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log("Supabase client initialized successfully.");
      
      // Call magic link handler AFTER Supabase client is initialized
      handleMagicLinkAuth();
      
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
      if (totalCompletionTokensEl)
        totalCompletionTokensEl.textContent = "Error";
      if (totalTokensAllTimeEl) totalTokensAllTimeEl.textContent = "Error";
      return;
    }

    try {
      // V2: Load from new token_usage_log format
      const result = await chrome.storage.local.get("token_usage_log");
      const usageLog = result.token_usage_log || [];

      if (usageLog.length > 0) {
        // Calculate totals from log entries
        const totals = usageLog.reduce(
          (acc, entry) => {
            acc.prompt_tokens += entry.prompt_tokens || 0;
            acc.completion_tokens += entry.completion_tokens || 0;
            acc.total_tokens += entry.total_tokens || 0;
            return acc;
          },
          { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        );

        if (totalPromptTokensEl) {
          totalPromptTokensEl.textContent =
            totals.prompt_tokens.toLocaleString();
        }
        if (totalCompletionTokensEl) {
          totalCompletionTokensEl.textContent =
            totals.completion_tokens.toLocaleString();
        }
        if (totalTokensAllTimeEl) {
          totalTokensAllTimeEl.textContent =
            totals.total_tokens.toLocaleString();
        }
        if (lastUsageUpdateEl) {
          const lastEntry = usageLog[usageLog.length - 1];
          lastUsageUpdateEl.textContent = new Date(
            lastEntry.timestamp,
          ).toLocaleString();
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
  let isLoadingCredits = false; // Prevent multiple simultaneous credit loads
  
  async function loadAndDisplayCredits() {
    console.log("[loadAndDisplayCredits] Starting to load credits...");

    if (isLoadingCredits) {
      console.log("[loadAndDisplayCredits] Already loading credits, skipping...");
      return;
    }

    if (!supabaseClient) {
      console.log("[loadAndDisplayCredits] No Supabase client available");
      if (creditsBalanceEl)
        creditsBalanceEl.textContent = "Auth service unavailable";
      return;
    }

    isLoadingCredits = true;

    try {
      console.log("[loadAndDisplayCredits] Getting session...");
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session || !session.user) {
        console.log("[loadAndDisplayCredits] No session found");
        if (creditsBalanceEl)
          creditsBalanceEl.textContent = "Please log in to view credits";
        return;
      }

      console.log(
        "[loadAndDisplayCredits] Session found, user:",
        session.user.email,
      );
      console.log(
        "[loadAndDisplayCredits] Querying user_profiles for user ID:",
        session.user.id,
      );

      // Fetch current credits from user_profiles
      const { data: profile, error: profileError } = await supabaseClient
        .from("user_profiles")
        .select("credits")
        .eq("id", session.user.id)
        .single();

      console.log("[loadAndDisplayCredits] Profile query result:", {
        profile,
        profileError,
      });

      if (profileError) {
        console.error(
          "[loadAndDisplayCredits] Error fetching user profile:",
          profileError,
        );
        displayCredits("--", "Unable to load credits");
        return;
      }

      if (profile) {
        console.log(
          "[loadAndDisplayCredits] Profile found, credits:",
          profile.credits,
        );
        displayCredits(profile.credits);
      } else {
        console.log("[loadAndDisplayCredits] No profile found");
        // No profile found, this shouldn't happen but handle gracefully
        displayCredits(0, "No profile found");
      }
    } catch (error) {
      console.error("[loadAndDisplayCredits] Error loading credits:", error);
      if (creditsBalanceEl)
        creditsBalanceEl.textContent = "Error loading credits";
    } finally {
      isLoadingCredits = false;
    }
  }

  /**
   * Display credits in the UI
   */
  function displayCredits(balance, message) {
    if (creditsBalanceEl) {
      if (message) {
        creditsBalanceEl.textContent = message;
      } else {
        creditsBalanceEl.textContent = balance;
      }
    }
  }

  if (refreshCreditsButton) {
    refreshCreditsButton.addEventListener("click", loadAndDisplayCredits);
  }

  // --- P3-02: Credit Purchase System ---

  // Package pricing configuration
  const CREDIT_PACKAGES = {
    starter: { credits: 50, price: 500, name: "Starter Pack" }, // Price in cents
    power: { credits: 200, price: 1500, name: "Power Pack" },
    pro: { credits: 500, price: 3000, name: "Pro Pack" },
  };

  // Initialize package button listeners
  console.log("[Purchase] Looking for package buttons...");
  console.log("[Purchase] Found buttons:", packageButtons.length);

  packageButtons.forEach((button, index) => {
    console.log(`[Purchase] Setting up button ${index}:`, {
      packageType: button.getAttribute("data-package"),
      credits: button.getAttribute("data-credits"),
      price: button.getAttribute("data-price"),
    });

    button.addEventListener("click", async (e) => {
      console.log("[Purchase] Button clicked:", e.target);

      const packageType = e.target.getAttribute("data-package");
      const credits = parseInt(e.target.getAttribute("data-credits"));
      const price = parseInt(e.target.getAttribute("data-price"));

      console.log("[Purchase] Extracted data:", {
        packageType,
        credits,
        price,
      });

      await initiateCreditPurchase(packageType, credits, price);
    });
  });

  /**
   * Initiate credit purchase workflow
   */
  async function initiateCreditPurchase(packageType, credits, priceInCents) {
    console.log("[Purchase] initiateCreditPurchase called with:", {
      packageType,
      credits,
      priceInCents,
    });

    if (!supabaseClient) {
      console.error("[Purchase] No supabase client available");
      showPurchaseStatus(
        "Authentication service not available. Please refresh the page.",
        "error",
      );
      return;
    }

    try {
      console.log("[Purchase] Checking authentication...");
      // Check authentication
      const {
        data: { session },
        error: sessionError,
      } = await supabaseClient.auth.getSession();

      console.log("[Purchase] Session check result:", {
        session: !!session,
        sessionError,
      });

      if (sessionError || !session) {
        console.error("[Purchase] Authentication failed:", sessionError);
        showPurchaseStatus("Please log in to purchase credits.", "error");
        return;
      }

      console.log("[Purchase] User authenticated:", session.user.email);
      showPurchaseStatus("Redirecting to secure payment...", "info");

      // Check if StripeClient is available
      console.log("[Purchase] Checking StripeClient availability:", {
        StripeClient: !!window.StripeClient,
        getPriceId: !!window.StripeClient?.getPriceId,
        redirectToCheckout: !!window.StripeClient?.redirectToCheckout,
      });

      if (!window.StripeClient) {
        throw new Error("StripeClient not loaded. Please refresh the page.");
      }

      // Get Stripe price ID for this package
      const priceId = window.StripeClient.getPriceId(packageType);
      console.log("[Purchase] Price ID lookup:", { packageType, priceId });

      if (!priceId) {
        throw new Error(`Price ID not found for package: ${packageType}`);
      }

      console.log("[Purchase] Calling redirectToCheckout with:", {
        priceId,
        email: session.user.email,
        credits,
        packageType,
      });

      // Redirect to Stripe Checkout
      await window.StripeClient.redirectToCheckout(
        priceId,
        session.user.email,
        credits,
        packageType,
      );

      console.log(
        "[Purchase] redirectToCheckout completed (this should not be reached if redirect worked)",
      );
    } catch (error) {
      console.error("[Purchase] Error initiating purchase:", error);
      showPurchaseStatus(
        `An error occurred during checkout: ${error.message}`,
        "error",
      );
    }
  }

  /**
   * Show purchase status messages
   */
  function showPurchaseStatus(message, type) {
    if (purchaseStatusEl) {
      purchaseStatusEl.textContent = message;
      purchaseStatusEl.className = `status-message ${type}`;
      purchaseStatusEl.style.display = "block";

      // Auto-hide success and error messages after 8 seconds
      if (type === "success" || type === "error") {
        setTimeout(() => {
          purchaseStatusEl.style.display = "none";
        }, 8000);
      }
    }
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

      // P3-02: Show credit purchase section for authenticated users
      if (creditsPurchaseEl) {
        creditsPurchaseEl.style.display = "block";
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

      // P3-02: Hide credit purchase section for unauthenticated users
      if (creditsPurchaseEl) {
        creditsPurchaseEl.style.display = "none";
      }

      // Clear credits display for logged-out users
      if (creditsBalanceEl) creditsBalanceEl.textContent = "Please log in";
    }
  }

  // Send Magic Link (unified authentication method)
  if (sendMagicLinkButton && emailInput && supabaseClient) {
    sendMagicLinkButton.addEventListener("click", async () => {
      const email = emailInput.value.trim();
      if (!email) {
        showAuthStatus("Email address is required.", "error");
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showAuthStatus("Please enter a valid email address.", "error");
        return;
      }

      try {
        sendMagicLinkButton.textContent = "Sending...";
        sendMagicLinkButton.disabled = true;

        // Send magic link via background script
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: "SEND_MAGIC_LINK", email: email },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            }
          );
        });

        if (response.success) {
          showAuthStatus(response.message, "success");
          emailInput.value = ""; // Clear email field
        } else {
          showAuthStatus(response.error || "Failed to send magic link", "error");
        }
      } catch (error) {
        console.error("Magic link error:", error);
        showAuthStatus("Failed to send magic link. Please try again.", "error");
      } finally {
        sendMagicLinkButton.textContent = "📬 Send Magic Link";
        sendMagicLinkButton.disabled = false;
      }
    });
  }

  // Set up auth listener
  if (supabaseClient) {
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
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
      const {
        data: { session },
        error,
      } = await supabaseClient.auth.getSession();
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

  // Handle Stripe checkout returns
  handleStripeReturn();

  // --- Success/Cancel Handling for Stripe Returns ---

  /**
   * Handle URL parameters for Stripe checkout returns
   */
  function handleStripeReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get("success");
    const cancelled = urlParams.get("cancelled");

    if (success === "true") {
      showPurchaseStatus(
        "🎉 Payment successful! Your credits will be added shortly.",
        "success",
      );
      // Refresh credits display after a short delay to allow webhook processing
      setTimeout(() => {
        loadAndDisplayCredits();
      }, 2000);

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (cancelled === "true") {
      showPurchaseStatus(
        "Payment was cancelled. No charges were made.",
        "error",
      );

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // --- Site Preferences Logic ---

  // Site display information (mirrored from utils/sitePreferences.js)
  function getSiteDisplayInfo() {
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

  // Default site preferences
  function getDefaultSitePreferences() {
    return {
      "chatgpt.com": { enabled: true },
      "claude.ai": { enabled: true },
      "gemini.google.com": { enabled: true },
      "lovable.dev": { enabled: true },
    };
  }

  // Show site preferences status message
  function showSitePrefsStatus(message, type) {
    if (sitePrefsStatusDiv) {
      sitePrefsStatusDiv.textContent = message;
      sitePrefsStatusDiv.className = "status-message " + type;
      sitePrefsStatusDiv.style.display = "block";
      setTimeout(() => {
        sitePrefsStatusDiv.style.display = "none";
      }, 3000);
    }
  }

  // Load and display site preferences
  async function loadSitePreferences() {
    try {
      const result = await chrome.storage.sync.get(["site_preferences"]);
      const preferences =
        result.site_preferences || getDefaultSitePreferences();

      console.log("Loaded site preferences:", preferences);
      displaySitePreferences(preferences);
    } catch (error) {
      console.error("Error loading site preferences:", error);
      showSitePrefsStatus("Error loading site preferences", "error");
    }
  }

  // Display site preferences UI
  function displaySitePreferences(preferences) {
    if (!siteTogglesContainer) return;

    // Clear existing content
    siteTogglesContainer.innerHTML = "";

    const sites = getSiteDisplayInfo();

    sites.forEach((site) => {
      const isEnabled = preferences[site.key]?.enabled !== false; // Default to true if undefined

      const toggleDiv = document.createElement("div");
      toggleDiv.className = `site-toggle ${isEnabled ? "enabled" : "disabled"}`;

      toggleDiv.innerHTML = `
        <input 
          type="checkbox" 
          id="site-${site.key}" 
          class="site-toggle-checkbox"
          ${isEnabled ? "checked" : ""}
          data-site="${site.key}"
        >
        <div class="site-toggle-info">
          <div class="site-toggle-header">
            <span class="site-toggle-icon">${site.icon}</span>
            <span class="site-toggle-name">${site.name}</span>
          </div>
          <div class="site-toggle-url">${site.url}</div>
          <div class="site-toggle-description">${site.description}</div>
        </div>
      `;

      // Add click handler for the entire toggle area
      const checkbox = toggleDiv.querySelector(".site-toggle-checkbox");
      const toggleInfo = toggleDiv.querySelector(".site-toggle-info");

      toggleInfo.addEventListener("click", () => {
        checkbox.checked = !checkbox.checked;
        updateToggleVisuals(toggleDiv, checkbox.checked);
      });

      checkbox.addEventListener("change", () => {
        updateToggleVisuals(toggleDiv, checkbox.checked);
      });

      siteTogglesContainer.appendChild(toggleDiv);
    });
  }

  // Update toggle visual state
  function updateToggleVisuals(toggleDiv, isEnabled) {
    if (isEnabled) {
      toggleDiv.classList.remove("disabled");
      toggleDiv.classList.add("enabled");
    } else {
      toggleDiv.classList.remove("enabled");
      toggleDiv.classList.add("disabled");
    }
  }

  // Save site preferences
  async function saveSitePreferences() {
    try {
      const checkboxes = document.querySelectorAll(".site-toggle-checkbox");
      const preferences = {};

      checkboxes.forEach((checkbox) => {
        const site = checkbox.dataset.site;
        preferences[site] = { enabled: checkbox.checked };
      });

      await chrome.storage.sync.set({ site_preferences: preferences });
      showSitePrefsStatus("Site preferences saved successfully!", "success");
      console.log("Saved site preferences:", preferences);
    } catch (error) {
      console.error("Error saving site preferences:", error);
      showSitePrefsStatus("Error saving site preferences", "error");
    }
  }

  // Reset site preferences to defaults
  async function resetSitePreferences() {
    try {
      const defaults = getDefaultSitePreferences();
      await chrome.storage.sync.set({ site_preferences: defaults });
      displaySitePreferences(defaults);
      showSitePrefsStatus("Site preferences reset to defaults", "success");
      console.log("Reset site preferences to defaults");
    } catch (error) {
      console.error("Error resetting site preferences:", error);
      showSitePrefsStatus("Error resetting site preferences", "error");
    }
  }

  // Set up site preferences event listeners
  if (saveSitePrefsButton) {
    saveSitePrefsButton.addEventListener("click", saveSitePreferences);
  }

  if (resetSitePrefsButton) {
    resetSitePrefsButton.addEventListener("click", resetSitePreferences);
  }

  // Initialize site preferences
  loadSitePreferences();

  console.log("CoPrompt Options: All event listeners set up successfully.");

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
});
