// Trigger CI re-deploy
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("Hello from Functions!");

serve(async (req: Request) => {
  const { name } = await req.json();
  const data = {
    message: `Hello ${name}! from the enhance function!`,
    description:
      "This is a test response to confirm the enhance function is deployed and reachable.",
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});

/* 
To invoke:

curl -i --location --request POST '<LOCAL_OR_REMOTE_SUPABASE_URL>/enhance' \
  --header 'Authorization: Bearer <YOUR_SUPABASE_ANON_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"name":"Functions"}'

*/
