# Credit Purchase System Testing Guide

## Test P3-02: Credit Purchase/Top-up System

**Objective**: Verify that authenticated users can successfully purchase credit packages through a professional UI with simulated payment processing.

### Prerequisites
- Extension built with `npm run build:dev`
- Extension loaded in Chrome
- Local Supabase running (`npx supabase start`)
- User account created and authenticated

### Test Cases

#### 1. Purchase UI Visibility
**Expected**: Purchase section only visible for authenticated users

1. Open extension settings page
2. Without login: Verify purchase section is hidden
3. Log in with valid credentials
4. Verify purchase section becomes visible
5. Check that all three package cards are displayed correctly

#### 2. Package Display Validation
**Expected**: Professional package cards with correct pricing

1. Verify **Starter Pack** displays:
   - Price: $5.00
   - Credits: 50 Credits
   - Value: $0.10 per credit
   - "Perfect for trying out CoPrompt"

2. Verify **Power Pack** displays:
   - Price: $15.00
   - Credits: 200 Credits  
   - Value: $0.075 per credit
   - "Save 25%" badge
   - "Most Popular" banner
   - "Great value for regular users"

3. Verify **Pro Pack** displays:
   - Price: $30.00
   - Credits: 500 Credits
   - Value: $0.06 per credit
   - "Save 40%" badge
   - "Best value for power users"

#### 3. Purchase Flow - Successful Transaction
**Expected**: Complete purchase workflow with credit granting

1. Note current credit balance
2. Click "Buy Power Pack" (200 credits for $15)
3. Verify status shows: "Initializing secure payment..."
4. Wait for processing (2 second simulation)
5. Verify status shows: "Payment successful! Adding credits to your account..."
6. Verify success message: "🎉 Success! 200 credits have been added to your account. New balance: [X] credits."
7. Verify credit balance updated correctly (previous + 200)
8. Check that credits display in both settings and popup refreshes

#### 4. Purchase Flow - Failed Transaction
**Expected**: Graceful handling of payment failures

1. Click any package button multiple times until you get a failure
2. Verify error message: "Payment was cancelled or failed. Please try again."
3. Verify credit balance remains unchanged
4. Verify UI remains functional for retry

#### 5. Authentication Validation
**Expected**: Purchase blocked for unauthenticated users

1. Log out while on settings page
2. Verify purchase section disappears
3. Try to manually trigger purchase (if possible)
4. Should see authentication error

#### 6. Multiple Package Testing
**Expected**: All packages work correctly

**Test Starter Pack:**
1. Current balance: Note starting amount
2. Click "Buy Starter Pack"
3. Verify +50 credits added
4. Verify correct pricing displayed ($5.00)

**Test Pro Pack:**
1. Click "Buy Pro Pack"  
2. Verify +500 credits added
3. Verify correct pricing displayed ($30.00)

#### 7. Purchase Event Logging
**Expected**: Purchase events logged to usage_events table

1. Complete a successful purchase
2. Check browser console for logging events
3. Verify no errors in the purchase flow
4. (Optional) Check Supabase dashboard for usage_events entry

#### 8. Balance Refresh Integration
**Expected**: Credit balance updates across UI

1. Complete a purchase in settings
2. Open extension popup
3. Verify popup shows updated credit balance
4. Click refresh in popup - balance should remain consistent
5. Go back to settings - balance should be consistent

### UI/UX Verification

#### Visual Design
- [ ] Package cards have professional styling with hover effects
- [ ] "Most Popular" badge displays correctly on Power Pack
- [ ] "Save %" badges display on Power and Pro packs
- [ ] Purchase buttons have proper gradient styling
- [ ] Status messages use appropriate colors (loading/success/error)

#### Responsive Behavior
- [ ] Package cards arrange properly in grid layout
- [ ] Cards maintain proper spacing and alignment
- [ ] Hover effects work smoothly on all cards
- [ ] Purchase buttons are full-width within cards

#### Interaction Feedback
- [ ] Purchase buttons show loading state during processing
- [ ] Status messages appear and auto-hide appropriately
- [ ] Success messages stay visible for 8 seconds
- [ ] Error messages stay visible for 8 seconds
- [ ] Loading messages persist until completion

### Error Handling Verification

#### Network Issues
- [ ] Graceful handling when Supabase is down
- [ ] Appropriate error messages for connection failures
- [ ] Purchase state doesn't get corrupted

#### Authentication Issues
- [ ] Purchase blocked when session expires
- [ ] Clear messaging about authentication requirements
- [ ] Graceful fallback to login prompt

#### Database Issues
- [ ] Handles profile fetch errors gracefully
- [ ] Handles balance update failures
- [ ] Provides helpful error messages to user

### Performance Verification
- [ ] Purchase UI loads quickly (<500ms)
- [ ] Package cards render without layout shift
- [ ] Purchase processing completes in reasonable time (2-3s)
- [ ] No memory leaks from repeated purchases
- [ ] Smooth animations and transitions

### Browser Console Checks
Open Chrome Dev Tools and verify:
- [ ] No JavaScript errors during purchase flow
- [ ] Proper logging from `[Purchase]` namespace
- [ ] Supabase operations log correctly
- [ ] No network errors or failed requests

## Expected Results Summary

| Test Scenario | Expected Result | Credit Change |
|---------------|----------------|---------------|
| Starter Pack Purchase | +50 credits, $5.00 charged | +50 |
| Power Pack Purchase | +200 credits, $15.00 charged | +200 |
| Pro Pack Purchase | +500 credits, $30.00 charged | +500 |
| Failed Payment | No credit change, error message | 0 |
| Unauthenticated | Purchase section hidden | N/A |

## Production Readiness Notes

### Current Implementation (Demo)
- ✅ Complete UI/UX system
- ✅ Purchase workflow simulation
- ✅ Credit granting and balance updates
- ✅ Event logging and tracking
- ⚠️ Simulated payment processing (90% success rate)

### Production Requirements
- [ ] Real Stripe integration with checkout sessions
- [ ] Server-side credit granting via webhooks
- [ ] Payment verification and security
- [ ] Refund handling capabilities
- [ ] Real payment processing and receipts

## Notes
- Current implementation simulates Stripe checkout for demonstration
- Credits are granted client-side (should be server-side in production)
- Payment simulation has 90% success rate for testing failures
- All purchase events are logged to usage_events table
- Integration ready for real Stripe implementation 