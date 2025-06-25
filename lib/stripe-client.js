/**
 * Stripe Client Integration for CoPrompt
 * Handles Stripe Checkout for credit purchases
 * CSP-compliant version without external Stripe.js
 */

/**
 * Create Stripe checkout session via Supabase function and redirect directly
 */
async function createCheckoutSessionAndRedirect(priceId, userEmail, credits, packageType) {
  try {
    console.log('[Stripe] Creating checkout session for:', { priceId, packageType, credits });
    
    // Get Supabase URL and key from configuration
    const SUPABASE_URL = "https://evfuyrixpjgfytwfijpx.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2ZnV5cml4cGpnZnl0d2ZpanB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwODA0MDIsImV4cCI6MjA1OTY1NjQwMn0.GD6oTrvjKMdqSK4LgyRmD0E1k0zbKFg79sAlXy-fLyc";
    
    // Create checkout session via Supabase Edge Function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        price_id: priceId,
        customer_email: userEmail,
        metadata: {
          credits: credits.toString(),
          package_type: packageType,
          user_email: userEmail
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Stripe] Checkout session creation failed:', errorText);
      throw new Error(`Failed to create checkout session: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('[Stripe] Checkout session response:', data);
    
    if (!data.url) {
      throw new Error('No checkout URL returned from session creation');
    }

    // Redirect directly to Stripe checkout URL
    console.log('[Stripe] Redirecting to checkout:', data.url);
    window.location.href = data.url;

  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error);
    throw error;
  }
}

/**
 * Get price ID for package type (test mode price IDs)
 */
function getPriceId(packageType) {
  // These should match your actual Stripe price IDs from the dashboard
  const priceIds = {
    starter: 'price_1RdWMnC0N7pRyDSZHPR9TYWV', // $5.00 for 50 credits
    power: 'price_1RdWPZC0N7pRyDSZXWiFXPjS',   // $15.00 for 200 credits  
    pro: 'price_1RdWSLC0N7pRyDSZOumtOw0D'      // $30.00 for 500 credits
  };

  return priceIds[packageType];
}

// Export functions to global scope for options.js
window.StripeClient = {
  redirectToCheckout: createCheckoutSessionAndRedirect,
  getPriceId
}; 