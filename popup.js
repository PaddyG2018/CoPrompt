document.addEventListener("DOMContentLoaded", function () {
  console.log("[Popup] CoPrompt V2 popup loaded");

  // Supabase Configuration (matching options.js)
  const SUPABASE_URL = "https://evfuyrixpjgfytwfijpx.supabase.co"; // LIVE - NOW ACTIVE
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZnV5cml4cGpnZnl0d2ZpanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODA0MDIsImV4cCI6MjA1OTY1NjQwMn0.GD6oTrvjKMdqSK4LgyRmD0E1k0zbKFg79sAlXy-fLyc";

  // Local development - COMMENTED OUT FOR LIVE
  // const SUPABASE_URL = "http://127.0.0.1:54321";
  // const SUPABASE_ANON_KEY =
  //   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

  let supabaseClient = null;

  // DOM elements
  const creditsBalance = document.getElementById("creditsBalance");
  const creditsStatus = document.getElementById("creditsStatus");
  const creditsError = document.getElementById("creditsError");
  const refreshCredits = document.getElementById("refreshCredits");
  const creditsContainer = document.querySelector(".credits-container");
  const authPrompt = document.getElementById("authPrompt");
  const signUpButton = document.getElementById("signUpButton");
  const optionsButton = document.getElementById("optionsButton");
  const supportButton = document.getElementById("supportButton");

  // Initialize Supabase client
  if (window.supabase) {
    try {
      const { createClient } = window.supabase;
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log("[Popup] Supabase client initialized successfully");
    } catch (error) {
      console.error("[Popup] Error initializing Supabase client:", error);
      showError("Auth service initialization failed");
    }
  } else {
    console.error("[Popup] Supabase client library not loaded");
    showError("Auth service library not available");
  }

  // Open settings page
  optionsButton.addEventListener("click", function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  });

  // Sign up button (opens settings)
  signUpButton.addEventListener("click", function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  });

  // Support button (opens contact page)
  supportButton.addEventListener("click", function () {
    chrome.tabs.create({ url: "https://www.coprompt.app/contact" });
  });

  // Refresh credits button
  refreshCredits.addEventListener("click", function () {
    loadCredits();
  });

  // Load credits on popup open
  loadCredits();

  /**
   * Load and display user credits
   */
  async function loadCredits() {
    console.log("[Popup] Loading credits...");

    if (!supabaseClient) {
      showError("Auth service not available");
      return;
    }

    // Show loading state
    setLoadingState();

    try {
      // Get current session
      const {
        data: { session },
        error: sessionError,
      } = await supabaseClient.auth.getSession();

      if (sessionError) {
        console.error("[Popup] Session error:", sessionError);
        showError("Authentication error");
        return;
      }

      if (!session || !session.user) {
        console.log("[Popup] No session found, showing auth prompt");
        showAuthPrompt();
        return;
      }

      console.log("[Popup] Valid session found for user:", session.user.email);

      // Fetch credits from user_profiles table
      const { data: profile, error: profileError } = await supabaseClient
        .from("user_profiles")
        .select("credits")
        .eq("id", session.user.id)
        .single();

      if (profileError) {
        console.error("[Popup] Error fetching user profile:", profileError);
        console.error(
          "[Popup] Full error details:",
          JSON.stringify(profileError, null, 2),
        );
        console.error("[Popup] Error message:", profileError.message);
        console.error("[Popup] Error code:", profileError.code);
        showError("Unable to load credits");
        return;
      }

      const credits = profile?.credits || 0;
      console.log("[Popup] Credits loaded:", credits);
      displayCredits(credits);
    } catch (error) {
      console.error("[Popup] Error loading credits:", error);
      showError("Connection error. Please try again.");
    }
  }

  /**
   * Display credits with color coding
   */
  function displayCredits(credits) {
    console.log("[Popup] Displaying credits:", credits);

    // Show credits container and hide auth prompt
    if (creditsContainer) creditsContainer.style.display = "block";
    authPrompt.style.display = "none";
    creditsError.style.display = "none";

    // Update credits display
    creditsBalance.innerHTML = `<span class="${getCreditColorClass(credits)}">${credits}</span>`;

    // Show and update status
    creditsStatus.style.display = "block";
    creditsStatus.className = `credits-status ${getCreditStatusClass(credits)}`;
    creditsStatus.textContent = getCreditStatusText(credits);

    // Enable refresh button and remove loading state
    refreshCredits.disabled = false;
    refreshCredits.classList.remove("loading");
  }

  /**
   * Get CSS class for credit color coding
   */
  function getCreditColorClass(credits) {
    if (credits > 20) return "credits-high";
    if (credits >= 10) return "credits-medium";
    return "credits-low";
  }

  /**
   * Get CSS class for credit status
   */
  function getCreditStatusClass(credits) {
    if (credits > 20) return "high";
    if (credits >= 10) return "medium";
    return "low";
  }

  /**
   * Get status text based on credit level
   */
  function getCreditStatusText(credits) {
    if (credits > 20) return "Plenty of credits available";
    if (credits >= 10) return "Good credit balance";
    if (credits > 0) return "Low credits - consider topping up";
    return "No credits remaining";
  }

  /**
   * Show loading state
   */
  function setLoadingState() {
    // Show credits container during loading
    if (creditsContainer) creditsContainer.style.display = "block";
    authPrompt.style.display = "none";
    creditsError.style.display = "none";
    creditsStatus.style.display = "none";
    creditsBalance.innerHTML =
      '<span class="credits-loading">Loading...</span>';
    refreshCredits.disabled = true;
    refreshCredits.classList.add("loading");
  }

  /**
   * Show authentication prompt
   */
  function showAuthPrompt() {
    // Hide credits container completely and show auth prompt
    if (creditsContainer) creditsContainer.style.display = "none";
    authPrompt.style.display = "block";
    creditsError.style.display = "none";
  }

  /**
   * Show error message
   */
  function showError(message) {
    // Show credits container but hide auth prompt
    if (creditsContainer) creditsContainer.style.display = "block";
    authPrompt.style.display = "none";
    creditsStatus.style.display = "none";
    creditsBalance.innerHTML = '<span class="credits-loading">--</span>';
    creditsError.style.display = "block";
    creditsError.textContent = message;
    refreshCredits.disabled = false;
    refreshCredits.classList.remove("loading");
  }

  console.log("[Popup] Event listeners set up successfully");
});
