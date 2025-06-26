import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import Stripe from "https://esm.sh/stripe@12.9.0?target=deno";

// Initialize Stripe client outside of the handler to reuse across requests
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🚀 Processing checkout session request...");

    const { price_id, customer_email, metadata } = await req.json();

    if (!price_id || !customer_email) {
      console.log("❌ Missing required fields");
      return new Response(
        JSON.stringify({ error: "price_id and customer_email are required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    console.log(
      `🛒 Creating checkout session for ${customer_email}, price: ${price_id}`,
    );

    // Create Stripe checkout session with optimized settings
    const sessionStartTime = Date.now();
    const session = await stripe.checkout.sessions.create({
      customer_email: customer_email,
      line_items: [
        {
          price: price_id,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `https://coprompt.app/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://coprompt.app/stripe/cancel`,
      metadata: metadata || {},
      payment_intent_data: {
        metadata: metadata || {},
      },
      // Add settings to speed up the process
      billing_address_collection: "auto",
      payment_method_types: ["card"],
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes from now
    });

    const sessionTime = Date.now() - sessionStartTime;
    console.log(
      `✅ Created checkout session: ${session.id} (took ${sessionTime}ms)`,
    );

    return new Response(
      JSON.stringify({
        session_id: session.id,
        url: session.url,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("❌ Error creating checkout session:", error.message);
    console.error("❌ Error stack:", error.stack);

    // Return a more specific error response
    const errorResponse = {
      error: error.message,
      type: error.type || "unknown_error",
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(errorResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
