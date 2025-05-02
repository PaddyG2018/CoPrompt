const DEBUG = false; // Or find a way to share this flag

/**
 * Calls the OpenAI Chat Completions API.
 *
 * @param {string} apiKey The decrypted OpenAI API key.
 * @param {string} systemInstruction The system instruction content.
 * @param {string} userPrompt The user prompt content (including context if any).
 * @returns {Promise<string>} Resolves with the enhanced prompt text.
 * @throws {Error} Rejects with an error message if the API call fails or returns an error.
 */
export async function callOpenAI(apiKey, systemInstruction, userPrompt) {
  if (DEBUG) console.log("[apiClient] Sending request to OpenAI API...");
  if (DEBUG) console.log("[apiClient] Using model: gpt-4.1-mini"); // Consider making model configurable

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 50000); // 50 second timeout

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini", // Consider making model configurable
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7, // Consider making temperature configurable
      }),
      signal: controller.signal,
    });

    if (DEBUG)
      console.log(`[apiClient] API response status: ${response.status}`);

    if (!response.ok) {
      let errorBody = null;
      try {
        // Attempt to parse the error body for more details
        errorBody = await response.json();
        console.error(`[apiClient] API error (${response.status}):`, errorBody);
      } catch (parseError) {
        // If parsing fails, try to get text
        try {
          const errorText = await response.text();
          console.error(
            `[apiClient] API error (${response.status}), could not parse JSON body:`,
            errorText,
          );
          errorBody = {
            error: { message: errorText || "Failed to read error body." },
          }; // Mimic OpenAI error structure
        } catch (textError) {
          console.error(
            `[apiClient] API error (${response.status}), failed to read error body as text:`,
            textError,
          );
          errorBody = {
            error: {
              message: `Status ${response.status}, unreadable error body.`,
            },
          };
        }
      }
      // Construct a user-friendly error message
      let errorMessage = `API Error (${response.status})`;
      if (errorBody?.error?.message) {
        errorMessage += `: ${errorBody.error.message}`;
      } else {
        errorMessage +=
          ". Please check API key, model access, or OpenAI status.";
      }
      // Add specific guidance for common errors
      if (response.status === 401) errorMessage += " (Invalid API Key?)";
      if (response.status === 429)
        errorMessage += " (Rate limit exceeded or quota issue?)";
      if (response.status === 404)
        errorMessage += " (Model not found or API endpoint issue?)";

      throw new Error(errorMessage);
    }

    // Success case: parse the response
    const data = await response.json();

    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      if (DEBUG)
        console.log(
          "[apiClient] Received response: ",
          data.choices[0].message.content,
        );
      return data.choices[0].message.content;
    } else {
      console.error(
        "[apiClient] Invalid response structure from OpenAI:",
        data,
      );
      throw new Error("Received invalid response structure from OpenAI API.");
    }
  } catch (error) {
    clearTimeout(timeoutId); // Ensure timeout is cleared on fetch errors too
    if (error.name === "AbortError") {
      console.error(
        "[apiClient] OpenAI API request timed out after 50 seconds.",
      );
      throw new Error("OpenAI API request timed out (50s).");
    } else {
      console.error("[apiClient] Error calling OpenAI API:", error);
      // Rethrow other errors (like the ones we created for non-OK status)
      // Or potentially wrap them if needed, but rethrowing is often fine
      throw error;
    }
  } finally {
    // Clear timeout only if it hasn't already been cleared or fired
    // The try/catch above handles clearing in most cases, but this is belt-and-suspenders
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
