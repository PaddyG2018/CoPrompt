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
    
    // Create checkout session via Supabase Edge Function with retry logic
    const response = await retryWithBackoff(async () => {
      console.log('[Stripe] Attempting to create checkout session...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
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
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    }, 3, 1000); // 3 retries with 1 second base delay

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
 * Retry function with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries, baseDelay) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        break; // Don't delay after the last attempt
      }
      
      // Check if it's a timeout or server error that we should retry
      const shouldRetry = error.name === 'AbortError' || 
                         (error.message && error.message.includes('504')) ||
                         (error.message && error.message.includes('Gateway Timeout')) ||
                         (error.message && error.message.includes('Failed to fetch'));
      
      if (!shouldRetry) {
        break; // Don't retry for non-retryable errors
      }
      
      const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
      console.log(`[Stripe] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
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