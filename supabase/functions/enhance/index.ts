// Trigger CI re-deploy
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@^2.0.0"; // Standardized JSR import
import { decodeBase64 } from "jsr:@std/encoding/base64";
import { encodeBase64 } from "jsr:@std/encoding/base64"; // Though only decode might be used here for key

console.log("Hello from Enhance Function (v2.1 - User Keys)!");

const RATE_LIMIT_WINDOW_SECONDS = 1; // Allow 1 request per second per IP
const VAULT_ENCRYPTION_KEY_NAME = "USER_API_KEY_ENCRYPTION_KEY";

// Helper function to convert Base64 to Uint8Array (for IV and encrypted key)
function base64ToUint8Array(base64: string): Uint8Array {
  return decodeBase64(base64);
}

// Helper function to convert ArrayBuffer to string (for decrypted key)
function arrayBufferToString(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

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
    console.log("[Enhance Function] Received request with Device ID:", deviceId);

    let determinedOpenAIApiKey: string | null = null;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error("Missing Supabase URL, Anon Key, or Service Role Key env variables.");
      // Critical for auth and admin operations, might decide to fail early
    }

    // Attempt to get user-specific key if Authorization header is present
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ") || !supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.log("[Enhance Function] No valid authorization header provided");
      return new Response(
        JSON.stringify({ 
          error: "Authentication required. Please sign up to get 25 free credits.",
          code: "AUTH_REQUIRED"
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[Enhance Function] Auth header found, attempting to use user-specific key.");
    const userSupabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userSupabaseClient.auth.getUser();

    if (authError) {
      console.warn("[Enhance Function] Auth error when trying to get user for API key:", authError.message);
      return new Response(
        JSON.stringify({ 
          error: "Authentication required. Please sign up to get 25 free credits.",
          code: "AUTH_REQUIRED"
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else if (user) {
      console.log(`[Enhance Function] Authenticated user: ${user.id}. Checking for stored API key.`);
      const adminSupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

      const { data: apiKeyData, error: dbError } = await adminSupabaseClient
        .from("user_api_keys")
        .select("encrypted_openai_api_key, iv")
        .eq("user_id", user.id)
        .single();

      if (dbError) {
        if (dbError.code === "PGRST116") { // Row not found, expected if user has no key
           console.log(`[Enhance Function] No stored API key found for user ${user.id}.`);
        } else {
          console.error(`[Enhance Function] DB error fetching API key for user ${user.id}:`, dbError.message);
        }
      } else if (apiKeyData && apiKeyData.encrypted_openai_api_key && apiKeyData.iv) {
        console.log(`[Enhance Function] Encrypted key found for user ${user.id}. Attempting decryption.`);
        const masterKeyBase64 = Deno.env.get(VAULT_ENCRYPTION_KEY_NAME);
        if (!masterKeyBase64) {
          console.error(`[Enhance Function] Vault secret ${VAULT_ENCRYPTION_KEY_NAME} not found for decryption.`);
        } else {
          try {
            const masterKeyBytes = base64ToUint8Array(masterKeyBase64);
            const cryptoKey = await crypto.subtle.importKey(
              "raw",
              masterKeyBytes,
              { name: "AES-GCM", length: 256 },
              false, // 'extractable' is false for importKey for decryption
              ["decrypt"]
            );

            const ivBytes = base64ToUint8Array(apiKeyData.iv);
            const encryptedApiKeyBytes = base64ToUint8Array(apiKeyData.encrypted_openai_api_key);

            const decryptedApiKeyBuffer = await crypto.subtle.decrypt(
              { name: "AES-GCM", iv: ivBytes },
              cryptoKey,
              encryptedApiKeyBytes
            );
            determinedOpenAIApiKey = arrayBufferToString(decryptedApiKeyBuffer);
            console.log(`[Enhance Function] Successfully decrypted and using API key for user ${user.id}.`);
          } catch (decryptionError: any) {
            console.error(`[Enhance Function] Decryption failed for user ${user.id}:`, decryptionError.message, decryptionError.stack);
          }
        }
      } else {
          console.log(`[Enhance Function] No API key data or IV found for user ${user.id} though record might exist.`);
      }
    } else {
      console.log("[Enhance Function] No user resolved from token, though auth header was present.");
      return new Response(
        JSON.stringify({ 
          error: "Authentication required. Please sign up to get 25 free credits.",
          code: "AUTH_REQUIRED"
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Remove fallback to environment variable if user-specific key wasn't determined
    if (!determinedOpenAIApiKey) {
      console.error("[Enhance Function] No API key available for authenticated user:", user.id);
      return new Response(
        JSON.stringify({ 
          error: "User API key configuration error. Please contact support.",
          code: "USER_KEY_ERROR"
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // --- Rate Limiting Logic (PX-04) ---
    // (Assuming supabaseUrl and supabaseServiceRoleKey are available from above or re-checked if necessary)
    if (supabaseUrl && supabaseServiceRoleKey) { // Ensure keys are present for rate limiting
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
            console.warn("[Enhance Function] Could not determine client IP for rate limiting. Using fallback.");
            clientIp = "local-dev-ip";
        }

        const rateLimitSupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);
        const { data: logData, error: selectError } = await rateLimitSupabaseClient
            .from("request_logs")
            .select("last_request_at")
            .eq("identifier", clientIp)
            .single();

        if (selectError && selectError.code !== "PGRST116") {
            console.error("[Enhance Function] Error fetching request log for rate limiting:", selectError);
        } else if (logData) {
            const lastRequestTime = new Date(logData.last_request_at).getTime();
            const currentTime = Date.now();
            if (currentTime - lastRequestTime < RATE_LIMIT_WINDOW_SECONDS * 1000) {
                return new Response(JSON.stringify({ error: "Too Many Requests" }), {
                    status: 429,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        }
        const { error: upsertError } = await rateLimitSupabaseClient
            .from("request_logs")
            .upsert({ identifier: clientIp, last_request_at: new Date().toISOString() });

        if (upsertError) {
            console.error("[Enhance Function] Error upserting request log for rate limiting:", upsertError);
        }
    } else {
        console.warn("[Enhance Function] Supabase URL/Service Key missing, skipping DB-based rate limiting.");
    }
    // --- End Rate Limiting Logic ---

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid request: 'messages' are required." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${determinedOpenAIApiKey}`, // Use the determined key
        },
        body: JSON.stringify({
          model: model || "gpt-4.1-mini",
          messages: messages,
          temperature: temperature || 0.7,
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse
        .json()
        .catch(() => ({ error: "Failed to parse OpenAI error response." }));
      console.error("[Enhance Function] OpenAI API Error:", openaiResponse.status, errorBody);
      return new Response(
        JSON.stringify({
          error: `OpenAI API error (${openaiResponse.status}): ${errorBody.error?.message || "Unknown error"}`,
        }),
        {
          status: openaiResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const openaiData = await openaiResponse.json();
    const enhancedPromptContent = openaiData.choices?.[0]?.message?.content;
    const usageData = openaiData.usage;

    if (!enhancedPromptContent) {
      console.error("[Enhance Function] Invalid response structure from OpenAI:", openaiData);
      return new Response(
        JSON.stringify({ error: "Invalid response structure from OpenAI." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: enhancedPromptContent,
        usage: usageData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[Enhance Function] Error in enhance function:", error.message, error.stack);
    return new Response(
      JSON.stringify({
        error: error.message || "An unexpected error occurred.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/* 
To invoke:

curl -i --location --request POST '<LOCAL_OR_REMOTE_SUPABASE_URL>/enhance' \
  --header 'Authorization: Bearer <YOUR_SUPABASE_ANON_KEY_OR_USER_JWT>' \
  --header 'Content-Type: application/json' \
  --data '{"model": "gpt-4.1-mini", "messages": [{"role": "user", "content": "What is Supabase?"}]}'

*/
