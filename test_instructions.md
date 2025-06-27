TESTING COPROMPT V1.0.0 - AI PROMPT ENHANCEMENT EXTENSION

=== IMPORTANT SETUP REQUIRED ===
Before testing, the extension URL must be configured in Supabase dashboard:

1. Get your extension ID:
   - Go to chrome://extensions/
   - Find CoPrompt extension
   - Copy the Extension ID (e.g., abcdefghijklmnopqrstuvwxyz)

2. Configure Supabase redirect URLs:
   - Go to https://supabase.com/dashboard/project/evfuyrixpjgfytwfijpx/auth/url-configuration
   - Add these redirect URLs:
     • chrome-extension://[YOUR-EXTENSION-ID]/options.html
     • chrome-extension://[YOUR-EXTENSION-ID]/options.html?magic_link=true
   - Replace [YOUR-EXTENSION-ID] with the actual extension ID

=== AUTHENTICATION NOTE ===
CoPrompt now uses MAGIC LINK ONLY authentication for enhanced security.
No passwords required - just email verification via magic links.

Test Email: reviewer@coprompt.app
(Magic links for this email will be monitored and processed quickly during review period)

=== QUICK START (5 minutes) ===
1. Install the extension and click the CoPrompt icon in toolbar
2. Click "Get Started" in popup to open options page
3. Enter test email: reviewer@coprompt.app
4. Click "Send Magic Link" button (📬 icon)
5. Check email for magic link and click to authenticate
6. Should redirect to extension options page with authentication success
7. Return to extension popup - you'll see 25 free credits

=== CORE FUNCTIONALITY TEST ===
1. Visit any supported site:
   - ChatGPT (chatgpt.com or chat.openai.com)
   - Claude (claude.ai)
   - Gemini (gemini.google.com)
   - Lovable (lovable.dev)

2. Click in the chat input field - CoPrompt button appears automatically
3. Type a simple prompt like: "help me write an email"
4. Click the blue CoPrompt button to enhance your prompt
5. Watch as your basic prompt transforms into a detailed, professional prompt
6. Credits will deduct from your balance (visible in popup)

=== BILLING SYSTEM TEST ===
1. In options page, click any "Purchase" button under credit packages
2. Use Stripe test card: 4242 4242 4242 4242, any future date, any 3-digit CVC
3. Complete purchase - credits added to account immediately
4. Verify credit balance updates in extension popup

=== SITE PREFERENCES TEST ===
1. In options page, scroll to "Site Preferences" section
2. Toggle any site off/on (e.g., disable ChatGPT)
3. Visit that site - CoPrompt button won't appear when disabled
4. Re-enable and refresh - button returns

=== SUPPORT SYSTEM TEST ===
1. Click "Help & Support" in popup
2. Opens professional contact form at coprompt.app/contact

=== SECURITY FEATURES ===
- Magic link authentication only (no password storage/management)
- Secure Supabase authentication with JWT tokens
- Built-in email verification (magic links verify email ownership)
- All communication encrypted with HTTPS/TLS
- Row-level security policies protect user data
- Stripe handles all payment processing (PCI compliant)

NOTES FOR REVIEWERS:
- Extension works across 4 major AI platforms
- Privacy-focused: prompts processed temporarily, not permanently stored
- Credit-based model: users get 25 free credits, can purchase more
- No API keys required from users
- All preferences stored in Chrome sync storage
- Unified magic link authentication for all entry points

For immediate testing access or magic link issues during review, 
contact: support@coprompt.app with subject "Chrome Web Store Review - Urgent"

The test account has unlimited credits for thorough testing of all features. 