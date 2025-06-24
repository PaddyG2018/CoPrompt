// Script to add API key for test user using direct JWT
const { default: fetch } = require('node-fetch');

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// STEP 1: JWT from browser console (COMPLETE ✅)
const USER_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwOi8vMTI3LjAuMC4xOjU0MzIxL2F1dGgvdjEiLCJzdWIiOiIwY2I3OWM1ZS02ZjQ3LTRjMTktYjBkNC0yZjJmYzg0YmQyYzYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzUwNzY2Njc1LCJpYXQiOjE3NTA3NjMwNzUsImVtYWlsIjoicGdpbGxpZ2EwNCtjcHRlc3QxMEBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoicGdpbGxpZ2EwNCtjcHRlc3QxMEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiIwY2I3OWM1ZS02ZjQ3LTRjMTktYjBkNC0yZjJmYzg0YmQyYzYifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc1MDc2MzA3NX1dLCJzZXNzaW9uX2lkIjoiOWZlZTllN2QtYzVhYi00NTk4LTgyMjUtZjc5OGNmZjYzNWIzIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.BwIOHXk58dwI2_90f7A52DLrslmMHu5bFMpN11PVVUc';

// STEP 2: Replace with a real OpenAI API key OR use test key for demo
const TEST_API_KEY = 'sk-REPLACE-WITH-YOUR-REAL-OPENAI-API-KEY'; // Replace with actual key from https://platform.openai.com/api-keys

async function setupAPIKey() {
  console.log('🔧 Setting up API key for logged-in user...\n');
  console.log('User: pgilliga04+cptest10@gmail.com');
  console.log('User ID: 0cb79c5e-6f47-4c19-b0d4-2f2fc84bd2c6');
  
  try {
    // Call the store-user-api-key function
    console.log('\nStoring API key via Supabase function...');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/store-user-api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${USER_JWT}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ apiKey: TEST_API_KEY })
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const result = await response.json().catch(() => ({}));
      console.log('✅ API key stored successfully!');
      console.log('   Response:', result);
      
      console.log('\n🎉 Setup complete! Your test user now has an API key.');
      console.log('   You can now test the full enhancement flow on Gemini/ChatGPT/Claude.');
      console.log('\n📋 Next steps:');
      console.log('   1. Go to any AI site (Gemini, ChatGPT, Claude)');
      console.log('   2. Type a test prompt');
      console.log('   3. Click "Improve Prompt" button');
      console.log('   4. Should now work instead of showing API key error!');
      
    } else {
      const errorData = await response.text();
      console.error('❌ Failed to store API key:', response.status);
      console.error('   Error response:', errorData);
      
      if (response.status === 401) {
        console.log('\n💡 JWT might be expired. Get a fresh one from browser console.');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Ready to run!
setupAPIKey(); 