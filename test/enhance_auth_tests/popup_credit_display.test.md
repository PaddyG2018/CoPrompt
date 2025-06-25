# Popup Credit Display Testing Guide

## Test P3-01: Credit Pill in Extension Popup

**Objective**: Verify that the extension popup displays user credits with proper color coding, refresh functionality, and authentication handling.

### Prerequisites
- Extension built with `npm run build:dev`
- Extension loaded in Chrome
- Local Supabase running (`npx supabase start`)

### Test Cases

#### 1. Unauthenticated User Flow
**Expected**: Auth prompt displayed with signup CTA

1. Open extension popup (click extension icon)
2. Verify display shows:
   - "Sign in to view" message for credits
   - "Sign up to get 25 free credits" auth prompt
   - "Get Started" button visible
3. Click "Get Started" button
4. Verify it opens the options/settings page

#### 2. Authenticated User - High Credits (>20)
**Expected**: Green credit display with positive status

1. Ensure user is logged in with >20 credits
2. Open extension popup
3. Verify display shows:
   - Credit balance in GREEN color
   - Status: "Plenty of credits available" (green background)
   - No auth prompt visible
   - Refresh button is enabled

#### 3. Authenticated User - Medium Credits (10-20)
**Expected**: Orange credit display with warning status

1. Manually reduce user credits to 15 (via database or enhancement)
2. Open extension popup
3. Verify display shows:
   - Credit balance in ORANGE color
   - Status: "Good credit balance" (orange background)
   - No auth prompt visible

#### 4. Authenticated User - Low Credits (<10)
**Expected**: Red credit display with low credit warning

1. Manually reduce user credits to 5
2. Open extension popup
3. Verify display shows:
   - Credit balance in RED color
   - Status: "Low credits - consider topping up" (red background)
   - Warning about credits running low

#### 5. Authenticated User - Zero Credits
**Expected**: Red display with no credits message

1. Manually set user credits to 0
2. Open extension popup
3. Verify display shows:
   - "0" in RED color
   - Status: "No credits remaining" (red background)

#### 6. Refresh Functionality
**Expected**: Credit balance updates when refreshed

1. Open popup with authenticated user
2. Note current credit balance
3. Click the refresh button (🔄)
4. Verify:
   - Button temporarily disabled during refresh
   - Credits reload and display correctly
   - Any changes in credits are reflected

#### 7. Error Handling
**Expected**: Graceful error display when connection fails

1. Stop Supabase local server (`npx supabase stop`)
2. Open extension popup
3. Verify display shows:
   - Error message: "Connection error. Please try again."
   - "--" displayed for credits
   - Refresh button enabled for retry

#### 8. Settings Navigation
**Expected**: Settings button opens options page

1. Open extension popup
2. Click "Settings" button
3. Verify it opens the options/settings page

### UI/UX Verification

#### Visual Design
- [ ] Professional gradient background on credit container
- [ ] Proper color coding (Green/Orange/Red) based on credit levels
- [ ] Hover effects on refresh button
- [ ] Loading states show "Loading..." text
- [ ] Error states display clearly

#### Responsive Behavior
- [ ] Popup size appropriate (320px width)
- [ ] All elements fit within popup without scrolling
- [ ] Text is readable and properly sized
- [ ] Buttons have appropriate hit targets

#### Interaction Feedback
- [ ] Refresh button provides visual feedback
- [ ] Loading states are clear and informative
- [ ] Error messages are user-friendly
- [ ] All buttons respond to clicks

### Performance Verification
- [ ] Popup opens quickly (<500ms)
- [ ] Credit loading is reasonably fast (<2s)
- [ ] No console errors in browser dev tools
- [ ] Refresh functionality is responsive

### Browser Console Checks
Open Chrome Dev Tools and check for:
- [ ] No JavaScript errors
- [ ] Proper logging from `[Popup]` namespace
- [ ] Supabase client initialization success
- [ ] Credit loading events logged correctly

## Expected Results Summary

| User State | Credit Display | Status Message | Actions Available |
|------------|---------------|----------------|-------------------|
| Not Logged In | "Sign in to view" | Auth prompt | Get Started, Settings |
| >20 Credits | Green number | "Plenty of credits available" | Refresh, Settings |
| 10-20 Credits | Orange number | "Good credit balance" | Refresh, Settings |
| 1-9 Credits | Red number | "Low credits - consider topping up" | Refresh, Settings |
| 0 Credits | Red "0" | "No credits remaining" | Refresh, Settings |
| Connection Error | "--" | Error message | Refresh, Settings |

## Notes
- All credit values should update in real-time after enhancements
- Color coding should be consistent across all views
- Error handling should be graceful and user-friendly
- Performance should remain snappy even with network delays 