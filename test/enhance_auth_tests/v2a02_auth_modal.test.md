# V2A-02 Auth Modal Test

This is a manual test script to verify the pre-enhance authentication modal.

## Test Scenarios

### 1. Unauthenticated User Flow

- Clear all extension storage
- Go to any AI site (Gemini, ChatGPT, Claude)
- Type a test prompt
- Click "Improve Prompt" button
- **Expected**: Auth modal appears with:
  - "Get 25 Free Credits" header
  - Email input field
  - "Send Magic Link" button
  - Benefits list (25 free enhancements, no API key, no credit card)
  - Cancel button and settings link

### 2. Email Validation

- Try submitting empty email → error message
- Try invalid email format → error message
- Try valid email → "Sending..." state, then success message

### 3. Modal Interactions

- Click backdrop → modal closes
- Press Escape → modal closes
- Click Cancel → modal closes
- Click "Sign in via Settings" → opens options page

### 4. Authentication Flow

- Submit valid email → opens options page with pre-filled email
- Complete signup in options page
- Return to original page
- Click "Improve Prompt" again
- **Expected**: No modal, proceed directly to enhancement

### 5. Session Persistence

- After authentication, refresh page
- Click "Improve Prompt"
- **Expected**: No modal, proceed directly to enhancement

## Manual Testing Steps

1. **Clear Extension Data**:

   ```javascript
   // Run in console on any page
   chrome.storage.local.clear();
   ```

2. **Test Unauthenticated Flow**:

   - Go to gemini.google.com
   - Type: "write me a strength programme"
   - Click the floating "Improve Prompt" button
   - Verify modal appears with correct styling and content

3. **Test Email Submission**:

   - Try various email formats
   - Submit valid email (e.g., test@example.com)
   - Verify options page opens with pre-filled email

4. **Complete Authentication**:

   - In options page, enter password and click "Sign Up"
   - Verify success message and credit balance shows 25

5. **Test Authenticated Flow**:
   - Return to Gemini tab
   - Click "Improve Prompt" again
   - Verify enhancement proceeds without modal

## Success Criteria

✅ Modal appears for unauthenticated users
✅ Modal has correct styling and content
✅ Email validation works properly
✅ Modal interactions (close, cancel, etc.) work
✅ Email submission opens options page correctly
✅ Authentication completes successfully
✅ Authenticated users skip modal
✅ Session persists across page refreshes

## Known Limitations

- Currently opens options page instead of true magic link
- No real-time auth state updates (relies on polling)
- Basic email validation only
