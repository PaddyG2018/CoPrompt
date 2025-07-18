const DEBUG = false; // Or find a way to share this flag

/**
 * Calls the OpenAI Chat Completions API.
 * Now adapted to call the Supabase proxy, which then calls OpenAI.
 *
 * @param {string | null} apiKey - The user's OpenAI API key (currently not used by this function, as Supabase proxy uses anon key).
 * @param {string} systemInstruction - The system message for the AI.
 * @param {string} userPrompt - The user's prompt.
 * @param {string | null} userAccessToken - The user's JWT for Supabase authentication (optional).
 * @returns {Promise<object>} A promise that resolves to an object containing the enhanced prompt string and usage data.
 *                           Example: { enhancedPrompt: "response text", usage: { prompt_tokens: X, completion_tokens: Y, total_tokens: Z } }
 */
export async function callOpenAI(
  /** @type {string} */ apiKey,
  /** @type {string} */ systemInstruction,
  /** @type {string} */ userPrompt,
  /** @type {string} */ userAccessToken,
) {
  if (DEBUG)
    console.log(
      "[apiClient] callOpenAI called with (system, user, userAccessToken present?):",
      {
        systemInstruction,
        userPrompt,
        userAccessToken: !!userAccessToken,
      },
    );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 50000); // 50 second timeout

  try {
    // MODIFIED: URL points to Supabase Edge Function
    const response = await fetch(
      "https://evfuyrixpjgfytwfijpx.supabase.co/functions/v1/enhance", // LIVE URL - NOW ACTIVE
      // "http://127.0.0.1:54321/functions/v1/enhance", // LOCAL URL for testing - COMMENTED OUT
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // MODIFIED: Authorization uses Supabase anon key OR user JWT if available
          Authorization: `Bearer ${userAccessToken || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZnV5cml4cGpnZnl0d2ZpanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODA0MDIsImV4cCI6MjA1OTY1NjQwMn0.GD6oTrvjKMdqSK4LgyRmD0E1k0zbKFg79sAlXy-fLyc"}`,
          // apikey header for Supabase (anon key)
          apikey:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZnV5cml4cGpnZnl0d2ZpanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODA0MDIsImV4cCI6MjA1OTY1NjQwMn0.GD6oTrvjKMdqSK4LgyRmD0E1k0zbKFg79sAlXy-fLyc",
        },
        // V2A-05: Removed deviceId from API call - auth is JWT-based, deviceId only for local analytics
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId); // Clear timeout as soon as headers are received

    if (DEBUG)
      console.log(
        `[apiClient] Supabase function response status: ${response.status}`,
      );

    if (!response.ok) {
      let errorBody = null;
      try {
        errorBody = await response.json();
        console.error(
          `[apiClient] Supabase function error (${response.status}):`,
          errorBody,
        );
      } catch {
        try {
          const errorText = await response.text();
          console.error(
            `[apiClient] Supabase function error (${response.status}), could not parse JSON body:`,
            errorText,
          );
          errorBody = {
            error: { message: errorText || "Failed to read error body." },
          };
        } catch (textError) {
          console.error(
            `[apiClient] Supabase function error (${response.status}), failed to read error body as text:`,
            textError,
          );
          errorBody = {
            error: {
              message: `Status ${response.status}, unreadable error body.`,
            },
          };
        }
      }
      let errorMessage = `Supabase Function Error (${response.status})`;
      if (errorBody?.message) {
        // Supabase functions might return { "message": "error detail" } or { "error": "..." }
        errorMessage += `: ${errorBody.message}`;
      } else if (errorBody?.error?.message) {
        errorMessage += `: ${errorBody.error.message}`;
      } else if (errorBody?.error) {
        errorMessage += `: ${errorBody.error}`;
      } else {
        errorMessage += ". Check Supabase function logs.";
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // MODIFIED: Expecting { "message": "response string", "usage": { ... } } from the proxy
    if (data && typeof data.message === "string" && data.usage) {
      // Also check for data.usage
      if (DEBUG)
        console.log(
          "[apiClient] Received response from Supabase: ",
          data, // Log the whole data object
        );
      return { enhancedPrompt: data.message, usage: data.usage }; // Return an object
    } else {
      console.error(
        "[apiClient] Invalid response structure from Supabase function:",
        data,
      );
      throw new Error(
        "Received invalid response structure from Supabase function. Expected { message: string, usage: object }.",
      );
    }
  } catch (error) {
    if (timeoutId && error.name !== "AbortError") {
      // Check if timeoutId is still defined
      clearTimeout(timeoutId);
    }
    if (error.name === "AbortError") {
      console.error(
        "[apiClient] Supabase function request timed out after 50 seconds.",
      );
      throw new Error("Supabase function request timed out (50s).");
    } else {
      console.error("[apiClient] Error calling Supabase function:", error);
      throw error; // Rethrow other errors
    }
  }
}
