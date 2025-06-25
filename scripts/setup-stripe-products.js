#!/usr/bin/env node

/**
 * Stripe Products Setup Script
 * Creates credit pack products and prices in Stripe
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function setupStripeProducts() {
  console.log('🎯 Setting up CoPrompt credit packs in Stripe...\n');

  try {
    // Create products and prices
    const products = [
      {
        name: 'Starter Pack',
        description: '50 CoPrompt credits - Perfect for trying out premium features',
        credits: 50,
        price: 500, // $5.00 in cents
        metadata: { type: 'starter' }
      },
      {
        name: 'Power Pack',
        description: '200 CoPrompt credits - Most popular choice for regular users',
        credits: 200,
        price: 1500, // $15.00 in cents
        metadata: { type: 'power', popular: 'true' }
      },
      {
        name: 'Pro Pack',
        description: '500 CoPrompt credits - Best value for power users',
        credits: 500,
        price: 3000, // $30.00 in cents
        metadata: { type: 'pro', best_value: 'true' }
      }
    ];

    const createdProducts = [];

    for (const productData of products) {
      console.log(`📦 Creating product: ${productData.name}...`);
      
      // Create product
      const product = await stripe.products.create({
        name: productData.name,
        description: productData.description,
        metadata: {
          credits: productData.credits.toString(),
          ...productData.metadata
        }
      });

      // Create price
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: productData.price,
        currency: 'usd',
        metadata: {
          credits: productData.credits.toString(),
          type: productData.metadata.type
        }
      });

      createdProducts.push({
        product,
        price,
        type: productData.metadata.type
      });

      console.log(`✅ Created: ${product.name}`);
      console.log(`   Product ID: ${product.id}`);
      console.log(`   Price ID: ${price.id}`);
      console.log(`   Amount: $${(productData.price / 100).toFixed(2)}\n`);
    }

    // Output environment variables
    console.log('🔧 Add these to your .env file:\n');
    console.log('# Stripe Product Price IDs');
    
    createdProducts.forEach(({ price, type }) => {
      const envVarName = `STRIPE_${type.toUpperCase()}_PACK_PRICE_ID`;
      console.log(`${envVarName}=${price.id}`);
    });

    console.log('\n🎉 Stripe products setup complete!');
    console.log('\nNext steps:');
    console.log('1. Copy the price IDs above to your .env file');
    console.log('2. Set up webhook endpoint in Stripe Dashboard');
    console.log('3. Deploy the Supabase webhook function');

  } catch (error) {
    console.error('❌ Error setting up Stripe products:', error.message);
    process.exit(1);
  }
}

// Check if required environment variables are set
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY environment variable is required');
  console.log('\nPlease add your Stripe secret key to .env file:');
  console.log('STRIPE_SECRET_KEY=sk_test_your_key_here');
  process.exit(1);
}

setupStripeProducts(); 