# Session Management Enhancement - Manual Testing Plan

## Overview

This test plan validates the automatic session management functionality we implemented to eliminate the "Session expired" errors that previously required manual options page refresh.

## Test Environment Setup

### Prerequisites

1. Load the extension in Chrome developer mode using the `dist/` folder
2. Have a Supabase account with valid credentials
3. Access to ChatGPT or other supported AI sites
4. Chrome DevTools for monitoring console logs and storage

### Initial Setup

1. Open Chrome DevTools (F12)
2. Navigate to Application > Storage > Extension Storage
3. Clear any existing session data
4. Go to the extension popup and sign in fresh

## Test Scenarios

### Test 1: Normal Operation (Valid Session)

**Expected User Experience**: 1-2 second enhancement, seamless operation

**Steps**:

1. Ensure you're logged in with a fresh session (< 55 minutes old)
2. Go to ChatGPT and create a prompt
3. Click the CoPrompt enhancement button
4. **Expected**: Enhancement completes successfully within 1-2 seconds
5. **Verify**: Check console for `[SessionManager]` logs showing "Session is valid"

### Test 2: Session Near Expiry (Proactive Refresh)

**Expected User Experience**: 2-3 seconds total, automatic refresh, then successful enhancement

**Steps**:

1. Manually expire the session to trigger near-expiry condition:
   - In DevTools Application > Storage, find the extension storage
   - Edit `supabase_session.expires_at` to be 2 minutes from now (current timestamp + 120)
2. Go to ChatGPT and try to enhance a prompt
3. **Expected**:
   - Initial loading state (1-2 seconds)
   - Background refresh occurs automatically
   - Enhancement completes successfully
   - Total time: 2-3 seconds
4. **Verify**: Console shows refresh operation and success

### Test 3: Expired Session (Automatic Recovery)

**Expected User Experience**: 3-4 seconds total, automatic refresh, then successful enhancement

**Steps**:

1. Manually expire the session:
   - Edit `supabase_session.expires_at` to be in the past (current timestamp - 1000)
2. Try to enhance a prompt
3. **Expected**:
   - Loading indicator appears
   - Automatic token refresh occurs (2-3 seconds)
   - Enhancement completes successfully
   - Total time: 3-4 seconds
4. **Verify**: Console shows token refresh and new session storage

### Test 4: Refresh Failure - Auth Required

**Expected User Experience**: Clear error modal with helpful guidance

**Steps**:

1. Manually corrupt the refresh token:
   - Edit `supabase_session.refresh_token` to "invalid_token"
   - Set `expires_at` to past timestamp
2. Try to enhance a prompt
3. **Expected**:
   - Error toast appears: "Session expired. Please sign up to get 25 free credits."
   - Clear call-to-action to sign in
   - No infinite loading or crashes
4. **Verify**: User can click through to sign in and recover

### Test 5: Network Issues - Graceful Handling

**Expected User Experience**: Helpful error message, retry option

**Steps**:

1. Disconnect internet connection
2. With expired session, try to enhance a prompt
3. **Expected**:
   - Error message about network issues
   - Suggestion to check connection and retry
   - No crashes or infinite loading
4. Reconnect internet and verify retry works

### Test 6: Race Conditions - Multiple Tabs

**Expected User Experience**: Consistent behavior across tabs, no duplicate refreshes

**Steps**:

1. Open ChatGPT in 3 different tabs
2. Set session to expired in DevTools
3. Quickly try to enhance prompts in all 3 tabs simultaneously
4. **Expected**:
   - Only one refresh operation occurs (check network tab)
   - All tabs get the same refreshed session
   - All enhancements complete successfully
5. **Verify**: Console shows mutex protection and shared refresh promise

### Test 7: Circuit Breaker - Service Protection

**Expected User Experience**: Helpful error when service is down

**Steps**:

1. This requires controlled testing environment to simulate multiple failures
2. **Simulated scenario**: After 3 consecutive refresh failures
3. **Expected**: "Authentication service temporarily unavailable. Please try again later."
4. **Auto-recovery**: After 5-minute timeout, service should retry automatically

### Test 8: Multiple Enhancement Requests

**Expected User Experience**: Consistent fast responses

**Steps**:

1. With valid session, enhance 5 different prompts in quick succession
2. **Expected**: Each enhancement takes 1-2 seconds, no delays
3. **Verify**: No unnecessary session checks or refreshes

## Performance Metrics

### Target Metrics

- **Valid session enhancement**: < 2 seconds
- **Auto-refresh scenario**: < 4 seconds total
- **Session validation**: < 100ms
- **Error scenarios**: < 3 seconds to show error

### Monitoring Points

1. **Console Logs**: Look for SessionManager debug output
2. **Network Tab**: Verify single refresh calls, no duplicates
3. **Storage Tab**: Check session updates and proper storage
4. **Performance Tab**: Monitor any impact on page load

## Error Scenarios Validation

### Expected Error Messages

1. **Auth Required**: "Authentication required. Please sign up to get 25 free credits."
2. **Session Expired**: "Session expired. Please log in again."
3. **Network Issues**: "Network error occurred during refresh. Please check your connection."
4. **Service Down**: "Authentication service temporarily unavailable. Please try again later."
5. **Invalid Session**: "Invalid session. Please log in again."

### UI/UX Validation

- Error toasts appear with proper styling
- Loading states are visible during operations
- Button states change appropriately
- No confusing or technical error messages

## Success Criteria

### Functional Success

- [ ] Zero manual options page refreshes required
- [ ] Automatic session refresh works in all scenarios
- [ ] Error handling is graceful and user-friendly
- [ ] No race conditions or duplicate operations
- [ ] Performance targets met

### User Experience Success

- [ ] Enhancement feels seamless in normal operation
- [ ] Errors provide clear guidance
- [ ] Loading states are appropriate
- [ ] No unexpected behaviors or crashes

### Technical Success

- [ ] Console logs show proper operation
- [ ] No JavaScript errors
- [ ] Storage management works correctly
- [ ] Circuit breaker prevents service overload

## Rollback Plan

If critical issues are found:

1. Disable automatic refresh in SessionManager
2. Fall back to original "requires auth" behavior
3. Restore manual options page workflow as backup

## Test Results Log

**Date**: ****\_\_\_****  
**Tester**: ****\_\_\_****  
**Build Version**: Development build with SessionManager

### Test Results

- [ ] Test 1: Normal Operation - PASS/FAIL
- [ ] Test 2: Session Near Expiry - PASS/FAIL
- [ ] Test 3: Expired Session - PASS/FAIL
- [ ] Test 4: Refresh Failure - PASS/FAIL
- [ ] Test 5: Network Issues - PASS/FAIL
- [ ] Test 6: Race Conditions - PASS/FAIL
- [ ] Test 7: Circuit Breaker - PASS/FAIL
- [ ] Test 8: Multiple Requests - PASS/FAIL

### Notes

_Record any issues, unexpected behaviors, or suggestions for improvement_

---

**Ready for testing!** Load the built extension and work through these scenarios systematically.
