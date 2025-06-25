# Stripe Integration Setup Guide

## 1. Environment Variables

Add these to your `.env` file:

```bash
# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Stripe Product IDs (will be populated after setup)
STRIPE_STARTER_PACK_PRICE_ID=price_starter_pack_id
STRIPE_POWER_PACK_PRICE_ID=price_power_pack_id
STRIPE_PRO_PACK_PRICE_ID=price_pro_pack_id
```

## 2. Getting Stripe Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Create account or log in
3. Get your test keys from the "Developers" > "API keys" section
4. Add them to your `.env` file

## 3. Webhook Setup

After we deploy the Supabase function, you'll need to:

1. Go to "Developers" > "Webhooks" in Stripe Dashboard
2. Add endpoint: `https://your-project.supabase.co/functions/v1/stripe-webhook`
3. Select events: `checkout.session.completed`, `payment_intent.succeeded`
4. Copy the webhook secret to your `.env` file

## 4. Products Setup

Run the setup script after configuring your keys to create products and get their IDs.
