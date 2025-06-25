// Script to add API key for test user using direct JWT
const { default: fetch } = require("node-fetch");

const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = "REPLACE_WITH_YOUR_LOCAL_SUPABASE_ANON_KEY"; // Get from supabase status

// STEP 1: JWT from browser console (REPLACE WITH YOUR USER JWT)
const USER_JWT = "REPLACE_WITH_YOUR_USER_JWT_FROM_BROWSER_CONSOLE";

// STEP 2: Replace with a real OpenAI API key OR use test key for demo
const TEST_API_KEY = "sk-REPLACE-WITH-YOUR-REAL-OPENAI-API-KEY"; // Replace with actual key from https://platform.openai.com/api-keys

async function setupAPIKey() {
  console.log("🔧 Setting up API key for logged-in user...\n");
  console.log("User: REPLACE_WITH_YOUR_TEST_EMAIL");
  console.log("User ID: REPLACE_WITH_YOUR_USER_ID");

  try {
    // Call the store-user-api-key function
    console.log("\nStoring API key via Supabase function...");
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/store-user-api-key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${USER_JWT}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ apiKey: TEST_API_KEY }),
      },
    );

    console.log(`Response status: ${response.status}`);

    if (response.ok) {
      const result = await response.json().catch(() => ({}));
      console.log("✅ API key stored successfully!");
      console.log("   Response:", result);

      console.log("\n🎉 Setup complete! Your test user now has an API key.");
      console.log(
        "   You can now test the full enhancement flow on Gemini/ChatGPT/Claude.",
      );
      console.log("\n📋 Next steps:");
      console.log("   1. Go to any AI site (Gemini, ChatGPT, Claude)");
      console.log("   2. Type a test prompt");
      console.log('   3. Click "Improve Prompt" button');
      console.log("   4. Should now work instead of showing API key error!");
    } else {
      const errorData = await response.text();
      console.error("❌ Failed to store API key:", response.status);
      console.error("   Error response:", errorData);

      if (response.status === 401) {
        console.log(
          "\n💡 JWT might be expired. Get a fresh one from browser console.",
        );
      }
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Ready to run!
setupAPIKey();
