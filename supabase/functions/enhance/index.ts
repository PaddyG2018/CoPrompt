// Trigger CI re-deploy
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@^2.0.0"; // Standardized JSR import

console.log("Hello from Enhance Function (v2.1 - Server-side API Key)!");

const RATE_LIMIT_WINDOW_SECONDS = 1; // Allow 1 request per second per IP

Deno.serve(async (req: Request) => {
  const testVar = Deno.env.get("MY_TEST_VARIABLE_123");
  console.log(`MY_TEST_VARIABLE_123 value: ${testVar}`);

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { model, messages, temperature, deviceId } = await req.json();
    console.log(
      "[Enhance Function] Received request with Device ID:",
      deviceId,
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error(
        "Missing Supabase URL, Anon Key, or Service Role Key env variables.",
      );
      // Critical for auth and admin operations, might decide to fail early
    }

    // V2A-01: Enforce Authentication - No fallback to anonymous access
    const authHeader = req.headers.get("Authorization");
    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ") ||
      !supabaseUrl ||
      !supabaseAnonKey ||
      !supabaseServiceRoleKey
    ) {
      console.log("[Enhance Function] No valid authorization header provided");
      return new Response(
        JSON.stringify({
          error:
            "Authentication required. Please sign up to get 25 free credits.",
          code: "AUTH_REQUIRED",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      "[Enhance Function] Auth header found, verifying user authentication.",
    );
    const userSupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userSupabaseClient.auth.getUser();

    if (authError || !user) {
      console.warn(
        "[Enhance Function] Auth error when trying to get user:",
        authError?.message,
      );
      return new Response(
        JSON.stringify({
          error:
            "Authentication required. Please sign up to get 25 free credits.",
          code: "AUTH_REQUIRED",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`[Enhance Function] Authenticated user: ${user.id}.`);

    // V2: Use server-side shared OpenAI API key (no more user-specific keys)
    const determinedOpenAIApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!determinedOpenAIApiKey) {
      console.error("[Enhance Function] Server OpenAI API key not configured");
      return new Response(
        JSON.stringify({
          error: "Server configuration error. Please contact support.",
          code: "SERVER_CONFIG_ERROR",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      "[Enhance Function] Using server-side OpenAI API key for authenticated user:",
      user.id,
    );

    // V2A-03: Check user credits before proceeding
    const adminSupabaseClient = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
    );
    const { data: profile, error: profileError } = await adminSupabaseClient
      .from("user_profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error(
        `[Enhance Function] Error fetching user profile for ${user.id}:`,
        profileError.message,
      );
      return new Response(
        JSON.stringify({
          error: "Unable to verify account status. Please try again.",
          code: "PROFILE_ERROR",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const currentBalance = profile?.credits || 0;
    if (currentBalance <= 0) {
      console.log(
        `[Enhance Function] User ${user.id} has insufficient credits: ${currentBalance}`,
      );
      return new Response(
        JSON.stringify({
          error:
            "Insufficient credits. Please contact support for more credits.",
          code: "INSUFFICIENT_CREDITS",
          currentBalance,
        }),
        {
          status: 402, // Payment Required
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[Enhance Function] User ${user.id} has ${currentBalance} credits available`,
    );

    // --- V2A-04: Per-User Rate Limiting (replaced IP-based) ---
    if (supabaseUrl && supabaseServiceRoleKey) {
      const userId = user.id; // Use authenticated user ID instead of IP
      console.log(`[Enhance Function] Checking rate limit for user: ${userId}`);

      const rateLimitSupabaseClient = createClient(
        supabaseUrl,
        supabaseServiceRoleKey,
      );
      const { data: logData, error: selectError } =
        await rateLimitSupabaseClient
          .from("request_logs")
          .select("last_request_at")
          .eq("identifier", userId)
          .single();

      if (selectError && selectError.code !== "PGRST116") {
        console.error(
          "[Enhance Function] Error fetching request log for rate limiting:",
          selectError,
        );
      } else if (logData) {
        const lastRequestTime = new Date(logData.last_request_at).getTime();
        const currentTime = Date.now();
        const timeSinceLastRequest = currentTime - lastRequestTime;

        if (timeSinceLastRequest < RATE_LIMIT_WINDOW_SECONDS * 1000) {
          const remainingCooldown = Math.ceil(
            (RATE_LIMIT_WINDOW_SECONDS * 1000 - timeSinceLastRequest) / 1000,
          );
          console.log(
            `[Enhance Function] Rate limit exceeded for user ${userId}. Cooldown: ${remainingCooldown}s`,
          );

          return new Response(
            JSON.stringify({
              error: `Please wait ${remainingCooldown} seconds before making another request.`,
              code: "RATE_LIMIT_EXCEEDED",
              retryAfter: remainingCooldown,
            }),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
                "Retry-After": remainingCooldown.toString(),
              },
            },
          );
        }
      }

      // Update the last request timestamp for this user
      const { error: upsertError } = await rateLimitSupabaseClient
        .from("request_logs")
        .upsert({
          identifier: userId,
          last_request_at: new Date().toISOString(),
        });

      if (upsertError) {
        console.error(
          "[Enhance Function] Error upserting request log for rate limiting:",
          upsertError,
        );
      } else {
        console.log(
          `[Enhance Function] Rate limit timestamp updated for user: ${userId}`,
        );
      }
    } else {
      console.warn(
        "[Enhance Function] Supabase URL/Service Key missing, skipping user-based rate limiting.",
      );
    }
    // --- End V2A-04: Per-User Rate Limiting ---

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid request: 'messages' are required." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${determinedOpenAIApiKey}`, // Use the server-side key
        },
        body: JSON.stringify({
          model: model || "gpt-4.1-mini",
          messages: messages,
          temperature: temperature || 0.7,
        }),
      },
    );

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse
        .json()
        .catch(() => ({ error: "Failed to parse OpenAI error response." }));
      console.error(
        "[Enhance Function] OpenAI API Error:",
        openaiResponse.status,
        errorBody,
      );
      return new Response(
        JSON.stringify({
          error: `OpenAI API error (${openaiResponse.status}): ${errorBody.error?.message || "Unknown error"}`,
        }),
        {
          status: openaiResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const openaiData = await openaiResponse.json();
    const enhancedPromptContent = openaiData.choices?.[0]?.message?.content;
    const usageData = openaiData.usage;

    if (!enhancedPromptContent) {
      console.error(
        "[Enhance Function] Invalid response structure from OpenAI:",
        openaiData,
      );
      return new Response(
        JSON.stringify({ error: "Invalid response structure from OpenAI." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // V2A-03: Deduct credit after successful enhancement
    const { error: deductError } = await adminSupabaseClient
      .from("user_profiles")
      .update({ credits: currentBalance - 1 })
      .eq("id", user.id);

    if (deductError) {
      console.error(
        `[Enhance Function] Error deducting credit for user ${user.id}:`,
        deductError.message,
      );
      // Still return the response since API call succeeded, but log the issue
    } else {
      console.log(
        `[Enhance Function] Credit deducted for user ${user.id}. New balance: ${currentBalance - 1}`,
      );
    }

    // V2A-03: Log usage event
    const { error: usageLogError } = await adminSupabaseClient
      .from("usage_events")
      .insert({
        user_id: user.id,
        event_type: "enhancement",
        credits_used: 1,
        metadata: {
          model: model || "gpt-4.1-mini",
          prompt_tokens: usageData?.prompt_tokens || 0,
          completion_tokens: usageData?.completion_tokens || 0,
          total_tokens: usageData?.total_tokens || 0,
        },
      });

    if (usageLogError) {
      console.error(
        `[Enhance Function] Error logging usage event for user ${user.id}:`,
        usageLogError.message,
      );
    }

    return new Response(
      JSON.stringify({
        message: enhancedPromptContent,
        usage: usageData,
        creditsRemaining: currentBalance - 1,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error(
      "[Enhance Function] Error in enhance function:",
      error.message,
      error.stack,
    );
    return new Response(
      JSON.stringify({
        error: error.message || "An unexpected error occurred.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

/* 
To invoke:

curl -i --location --request POST '<LOCAL_OR_REMOTE_SUPABASE_URL>/enhance' \
  --header 'Authorization: Bearer <YOUR_USER_JWT>' \
  --header 'Content-Type: application/json' \
  --data '{"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "What is Supabase?"}]}'

*/
