// Trigger CI re-deploy
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// import { serve } from "https://deno.land/std@0.168.0/http/server.ts"; // REMOVE THIS
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"; // Import Supabase client

console.log("Hello from Enhance Function (v2 structure)!");

const RATE_LIMIT_WINDOW_SECONDS = 1; // Allow 1 request per second per IP

Deno.serve(async (req: Request) => { // USE Deno.serve
  // Test environment variable
  const testVar = Deno.env.get("MY_TEST_VARIABLE_123");
  console.log(`MY_TEST_VARIABLE_123 value: ${testVar}`);

  const openAIApiKeyFromEnv = Deno.env.get("OPENAI_API_KEY");
  console.log(`OPENAI_API_KEY from env: ${openAIApiKeyFromEnv ? "found" : "NOT FOUND"}`);

  // Common CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // Or restrict to your extension ID
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle CORS preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Rate Limiting Logic (PX-04) ---
    // Try to get client IP from headers first
    const xForwardedForHeader = req.headers.get("x-forwarded-for");
    let xForwardedFor: string | null = null;
    if (xForwardedForHeader) {
        const parts = xForwardedForHeader.split(",");
        if (parts.length > 0 && parts[0]) {
            xForwardedFor = parts[0].trim();
        }
    }
    const xRealIp = req.headers.get("x-real-ip");
    let clientIp = xForwardedFor || xRealIp;

    if (!clientIp) {
      console.warn("Could not determine client IP from headers. Using fallback for local testing.");
      clientIp = "local-dev-ip"; // Fallback IP for local testing
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase URL or Service Role Key not set for rate limiting DB access.");
      // If these are missing, we can't perform rate limiting via DB. 
      // Depending on policy, you might fail open (allow) or fail closed (deny with 500).
      // For now, proceeding without DB-based rate limiting if keys are missing.
    } else {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: logData, error: selectError } = await supabase
        .from("request_logs")
        .select("last_request_at")
        .eq("identifier", clientIp)
        .single();

      if (selectError && selectError.code !== 'PGRST116') { // PGRST116: "Row to append not found" (means no record yet)
        console.error("Error fetching request log:", selectError);
        // Potentially fail open or closed here too.
      } else if (logData) {
        const lastRequestTime = new Date(logData.last_request_at).getTime();
        const currentTime = Date.now();
        if ((currentTime - lastRequestTime) < (RATE_LIMIT_WINDOW_SECONDS * 1000)) {
          return new Response(JSON.stringify({ error: "Too Many Requests" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      // If no error or rate limit not exceeded, upsert the new request time
      const { error: upsertError } = await supabase
        .from("request_logs")
        .upsert({ identifier: clientIp, last_request_at: new Date().toISOString() });

      if (upsertError) {
        console.error("Error upserting request log:", upsertError);
        // Potentially fail open or closed.
      }
    }
    // --- End Rate Limiting Logic ---

    // 1. Retrieve OpenAI API key from secrets
    // const openAIApiKey = Deno.env.get("OPENAI_API_KEY"); // Already got it as openAIApiKeyFromEnv
    if (!openAIApiKeyFromEnv) { // Check the one we got from env
      console.error("OPENAI_API_KEY not set in Deno.env."); // Updated error message
      return new Response(JSON.stringify({ error: "Server configuration error: Missing API key." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse incoming request body from the extension
    // This is what background/apiClient.js sends currently
    const { model, messages, temperature } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid request: 'messages' are required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Call OpenAI API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openAIApiKeyFromEnv}`, // Use the env var
      },
      body: JSON.stringify({
        model: model || "gpt-4.1-mini", // Default to gpt-4.1-mini if not provided
        messages: messages,
        temperature: temperature || 0.7, // Default temperature if not provided
        // stream: false, // Ensure we are not streaming for now (PX-05 specific)
      }),
    });

    // 4. Handle OpenAI API response
    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.json().catch(() => ({ error: "Failed to parse OpenAI error response." }));
      console.error("OpenAI API Error:", openaiResponse.status, errorBody);
      return new Response(JSON.stringify({ 
        error: `OpenAI API error (${openaiResponse.status}): ${errorBody.error?.message || 'Unknown error'}` 
      }), {
        status: openaiResponse.status, // Forward OpenAI's status
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiData = await openaiResponse.json();

    // 5. Return the relevant part of OpenAI's response to the extension
    const enhancedPromptContent = openaiData.choices?.[0]?.message?.content;
    const usageData = openaiData.usage; // Extract usage data

    if (!enhancedPromptContent) {
      console.error("Invalid response structure from OpenAI:", openaiData);
      return new Response(JSON.stringify({ error: "Invalid response structure from OpenAI." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For PX-05, we want to return a richer object including usage.
    return new Response(JSON.stringify({
      message: enhancedPromptContent,
      usage: usageData // Include the usage data
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in enhance function:", error.message, error.stack); // Log stack for more detail
    return new Response(JSON.stringify({ error: error.message || "An unexpected error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* 
To invoke:

curl -i --location --request POST '<LOCAL_OR_REMOTE_SUPABASE_URL>/enhance' \
  --header 'Authorization: Bearer <YOUR_SUPABASE_ANON_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"name":"Functions"}'

*/
