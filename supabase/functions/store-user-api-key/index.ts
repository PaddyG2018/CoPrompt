// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@^2.0.0"
import { decodeBase64 } from "jsr:@std/encoding/base64"
import { encodeBase64 } from "jsr:@std/encoding/base64"

const VAULT_ENCRYPTION_KEY_NAME = "USER_API_KEY_ENCRYPTION_KEY" // Name of the secret in Supabase Vault

// Helper function to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return encodeBase64(new Uint8Array(buffer))
}

// Helper function to convert Base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  return decodeBase64(base64)
}

console.log("Hello from Functions!")

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // For development; restrict in production
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Create Supabase client with the user's ANON KEY for auth, or service role for admin tasks later
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") // Used for JWT verification initially
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") // Used for DB operations

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error("Missing Supabase URL, Anon Key, or Service Role Key env variables.")
      return new Response(JSON.stringify({ error: "Server configuration error." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // MODIFIED: Create Supabase client with Auth context of the function invoker
    const supabase = createClient(
      // Supabase API URL - env var exported by default when deployed.
      Deno.env.get("SUPABASE_URL") ?? "",
      // Supabase API ANON KEY - env var exported by default when deployed.
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      // Create client with Auth context of the user that called the function.
      // This way RLS policies are applied.
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    // 1. Authenticate the user using the JWT from the Authorization header
    //    (The client is now set up to do this correctly with getUser)
    const authHeader = req.headers.get("Authorization"); // We still need this for the client setup above
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid authorization token." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    // const jwt = authHeader.replace("Bearer ", ""); // No longer strictly needed here if getUser works directly
    const { data: { user }, error: authError } = await supabase.auth.getUser(); // Pass no arg, client uses its configured auth

    if (authError || !user) {
      console.error("Auth error:", authError)
      return new Response(JSON.stringify({ error: "Invalid token or authentication failed." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const userId = user.id

    // Create an admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Handle GET request: Check if API key exists
    if (req.method === "GET") {
      const { data, error: dbError } = await supabaseAdmin
        .from("user_api_keys")
        .select("user_id") // Select any column to check for existence
        .eq("user_id", userId)
        .maybeSingle() // Returns one row or null, doesn't error if not found

      if (dbError) {
        console.error(`Error checking API key status for user ${userId}:`, dbError)
        // Return false by default on error, or you could return a 500
        return new Response(JSON.stringify({ hasKey: false, error: "Database query failed." }), {
          status: 500, // Or 200 with hasKey: false depending on desired client handling
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ hasKey: !!data }), { // !!data will be true if data is not null/undefined
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Handle POST request: Store or clear API key
    if (req.method === "POST") {
      // 2. Parse the request body to get the API key
      if (req.headers.get("content-type") !== "application/json") {
        return new Response(JSON.stringify({ error: "Request body must be JSON." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      const body = await req.json()
      const plaintextApiKey = body.apiKey // Expects { "apiKey": "sk-..." } or { "apiKey": null } to clear

      // 3. Handle clearing the API key if plaintextApiKey is null or explicitly empty
      if (plaintextApiKey === null || plaintextApiKey === "") { // Check for null or empty string for clearing
        const { error: deleteError } = await supabaseAdmin
          .from("user_api_keys")
          .delete()
          .eq("user_id", userId)

        if (deleteError) {
          console.error(`Error deleting API key for user ${userId}:`, deleteError)
          return new Response(JSON.stringify({ error: "Failed to clear API key." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
        return new Response(JSON.stringify({ message: "API key cleared successfully." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // 4. Proceed to encrypt and store if a key is provided
      if (typeof plaintextApiKey !== 'string' || !plaintextApiKey.startsWith("sk-")) {
        return new Response(JSON.stringify({ error: "Invalid API key format provided." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const encryptionKeyBase64 = Deno.env.get(VAULT_ENCRYPTION_KEY_NAME)
      if (!encryptionKeyBase64) {
        console.error(`Vault secret ${VAULT_ENCRYPTION_KEY_NAME} not found.`)
        return new Response(JSON.stringify({ error: "Server encryption configuration error." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const masterKeyBytes = base64ToUint8Array(encryptionKeyBase64)
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        masterKeyBytes,
        { name: "AES-GCM", length: 256 },
        true, // allow Deno to use the key for encryption/decryption if needed later
        ["encrypt"]
      )

      const iv = crypto.getRandomValues(new Uint8Array(12)) // 12 bytes for AES-GCM is recommended
      const apiKeyBytes = new TextEncoder().encode(plaintextApiKey)

      const encryptedApiKeyBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        cryptoKey,
        apiKeyBytes
      )

      const encryptedApiKeyBase64 = arrayBufferToBase64(encryptedApiKeyBuffer)
      const ivBase64 = arrayBufferToBase64(iv.buffer) // iv is Uint8Array, its buffer is ArrayBuffer

      // 5. Upsert the encrypted key and IV into the database
      const { error: upsertError } = await supabaseAdmin
        .from("user_api_keys")
        .upsert({
          user_id: userId,
          encrypted_openai_api_key: encryptedApiKeyBase64,
          iv: ivBase64,
          updated_at: new Date().toISOString(), // RLS trigger handles this, but good practice
        }, { onConflict: "user_id" })

      if (upsertError) {
        console.error(`Error upserting API key for user ${userId}:`, upsertError)
        return new Response(JSON.stringify({ error: "Failed to store API key." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      return new Response(JSON.stringify({ message: "API key stored successfully." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

  } catch (error: any) {
    console.error("Unexpected error in store-user-api-key function:", error, error.stack)
    return new Response(JSON.stringify({ error: error.message || "An unexpected server error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/store-user-api-key' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
