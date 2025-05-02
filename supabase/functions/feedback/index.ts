// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "@supabase/supabase-js";
// We'll create this shared file next
import { corsHeaders } from "../_shared/cors.ts";

console.log(`Function 'feedback' up and running!`);

// Define the expected structure of the incoming feedback data
interface FeedbackPayload {
  feedbackType: "positive" | "negative";
  originalPrompt?: string;
  enhancedPrompt?: string;
  timestamp: number; // Milliseconds since epoch from client
  extensionVersion?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests. Required for browser clients.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Ensure this is a POST request
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the incoming JSON payload from the browser extension
    const payload = (await req.json()) as FeedbackPayload;
    console.log("Received feedback payload:", payload);

    // Basic validation on the payload
    if (
      !payload ||
      !payload.feedbackType ||
      !["positive", "negative"].includes(payload.feedbackType) ||
      typeof payload.timestamp !== "number"
    ) {
      console.error("Invalid payload received:", payload);
      return new Response(
        JSON.stringify({ error: "Invalid feedback payload structure" }),
        {
          status: 400, // Bad Request
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Supabase Client Initialization ---
    // Get Supabase credentials from environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error(
        "Server Error: Missing Supabase environment variables SUPABASE_URL or SUPABASE_ANON_KEY",
      );
      // Do not expose detailed errors to the client
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500, // Internal Server Error
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create a Supabase client for interacting with the database
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      // Specify Supabase auth options if needed, disable persistence for server-side
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    // --- End Supabase Client Initialization ---

    // --- Data Insertion ---
    // Convert the client timestamp (milliseconds) to a Date object
    // Supabase client handles converting Date object to appropriate timestamptz format
    const submittedAtClientDate = new Date(payload.timestamp);

    // Insert data into the 'feedback_submissions' table
    const { data, error } = await supabase
      .from("feedback_submissions") // Ensure this matches your table name
      .insert([
        {
          feedback_type: payload.feedbackType,
          original_prompt: payload.originalPrompt,
          enhanced_prompt: payload.enhancedPrompt,
          extension_version: payload.extensionVersion,
          submitted_at_client: submittedAtClientDate, // Pass Date object directly
          // user_id: null // Not collecting user ID yet
        },
      ])
      .select(); // Optionally select the inserted row back for logging/confirmation

    // Handle potential database errors
    if (error) {
      console.error("Error inserting feedback into Supabase:", error);
      // Do not expose detailed database errors to the client
      return new Response(
        JSON.stringify({
          error: "Failed to record feedback due to database error",
        }),
        {
          status: 500, // Internal Server Error
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("Feedback successfully inserted:", data);
    // --- End Data Insertion ---

    // Send success response back to the extension
    return new Response(
      JSON.stringify({ success: true, message: "Feedback recorded" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // OK
      },
    );
  } catch (err) {
    // Catch any unexpected errors during function execution
    console.error("Caught unhandled error in function handler:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error occurred" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/feedback' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
