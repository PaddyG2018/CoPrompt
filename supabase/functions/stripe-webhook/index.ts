import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.9.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Manual signature verification for Deno
async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const elements = signature.split(",");
    let timestamp = "";
    let v1Signature = "";

    for (const element of elements) {
      const [key, value] = element.split("=");
      if (key === "t") {
        timestamp = value;
      } else if (key === "v1") {
        v1Signature = value;
      }
    }

    if (!timestamp || !v1Signature) {
      return false;
    }

    // Create the signed payload
    const signedPayload = `${timestamp}.${body}`;

    // Create HMAC signature
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature_bytes = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedPayload),
    );

    const expectedSignature = Array.from(new Uint8Array(signature_bytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return expectedSignature === v1Signature;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== WEBHOOK DEBUG START ===");

  // Log basic request info
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log(
    "Headers:",
    JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2),
  );

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  console.log("Stripe-Signature header:", signature);
  console.log("Webhook secret exists:", !!webhookSecret);
  console.log("Webhook secret length:", webhookSecret?.length);
  console.log(
    "Webhook secret preview:",
    webhookSecret?.substring(0, 20) + "...",
  );

  if (!signature) {
    console.error("❌ No Stripe-Signature header found");
    return new Response("No signature header", {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (!webhookSecret) {
    console.error("❌ No webhook secret configured");
    return new Response("No webhook secret", {
      status: 500,
      headers: corsHeaders,
    });
  }

  try {
    // Read body
    const body = await req.text();
    console.log("Body length:", body.length);
    console.log("Body preview:", body.substring(0, 200));

    // Try signature verification
    console.log("🔐 Attempting signature verification...");
    const isValidSignature = await verifyStripeSignature(
      body,
      signature,
      webhookSecret,
    );

    if (!isValidSignature) {
      console.error("❌ Invalid signature");
      return new Response("Invalid signature", {
        status: 400,
        headers: corsHeaders,
      });
    }

    console.log("✅ Signature verification SUCCESS!");

    // Parse the event
    const event = JSON.parse(body);
    console.log("Event type:", event.type);
    console.log("Event ID:", event.id);

    // Handle the event
    if (event.type === "checkout.session.completed") {
      console.log("🛒 Processing checkout completion...");
      const session = event.data.object;

      // Get line items
      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
      );
      console.log("Line items count:", lineItems.data.length);

      if (lineItems.data.length > 0) {
        const price = lineItems.data[0].price;
        console.log(
          "Price metadata:",
          JSON.stringify(price?.metadata, null, 2),
        );

        const credits = parseInt(price?.metadata?.credits || "0");
        const customerEmail = session.customer_details?.email;

        console.log("Credits to add:", credits);
        console.log("Customer email:", customerEmail);

        if (credits > 0 && customerEmail) {
          // Find user and update credits
          const { data: authUsers } =
            await supabaseClient.auth.admin.listUsers();
          const user = authUsers.users.find((u) => u.email === customerEmail);

          if (user) {
            console.log("Found user:", user.id);

            // Get current balance first
            const { data: currentProfile } = await supabaseClient
              .from("user_profiles")
              .select("credits")
              .eq("id", user.id)
              .single();

            const currentBalance = currentProfile?.credits || 0;
            const newBalance = currentBalance + credits;

            console.log("Current balance:", currentBalance);
            console.log("New balance:", newBalance);

            // Update balance
            const { error } = await supabaseClient
              .from("user_profiles")
              .update({ credits: newBalance })
              .eq("id", user.id);

            if (error) {
              console.error("❌ Database update error:", error);
            } else {
              console.log("✅ Credits updated successfully!");

              // Log the purchase
              await supabaseClient.from("usage_events").insert({
                user_id: user.id,
                event_type: "credit_purchase",
                metadata: {
                  credits_purchased: credits,
                  stripe_session_id: session.id,
                  stripe_event_id: event.id,
                },
              });
            }
          } else {
            console.error("❌ User not found:", customerEmail);
          }
        }
      }
    }

    console.log("=== WEBHOOK DEBUG END ===");
    return new Response("OK", {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("❌ WEBHOOK ERROR:", error.message);
    console.error("❌ Error stack:", error.stack);
    console.error("❌ Error type:", error.constructor.name);
    console.log("=== WEBHOOK DEBUG END (ERROR) ===");

    return new Response(`Error: ${error.message}`, {
      status: 400,
      headers: corsHeaders,
    });
  }
});
