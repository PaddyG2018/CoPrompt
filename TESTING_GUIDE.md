# Testing the Session Management Enhancement

## Quick Start

### 1. Load the Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/` folder from this project
5. The CoPrompt extension should now appear in your extensions list

### 2. Verify Installation
1. Look for the CoPrompt icon in your browser toolbar
2. Go to ChatGPT (https://chatgpt.com/)
3. Create a text prompt
4. You should see a "Enhance with CoPrompt" button appear

### 3. Test Session Management
Follow the detailed test plan in `test/session_management_test_plan.md`

## Development Commands

```bash
# Run automated tests
npm test

# Build for development testing
npm run build:dev

# Build for production
npm run build:prod

# Watch for changes during development
npm run build:watch
```

## Key Files Modified
- `utils/sessionManager.js` - Core session management logic
- `background.js` - Background script integration
- `content.js` - Content script enhancements  
- `content.css` - UI improvements
- `test/session_management/session_manager.test.js` - Test suite

## Expected Improvements
- ✅ Zero manual options page refreshes needed
- ✅ Automatic token refresh (90%+ of cases)
- ✅ Clear error messages when refresh fails
- ✅ Better loading states and UX
- ✅ Race condition protection
- ✅ Circuit breaker for service protection

## Monitoring During Testing
1. **Console Logs**: Look for `[SessionManager]` debug output
2. **Network Tab**: Check for refresh API calls
3. **Application Storage**: Monitor session data updates
4. **Performance**: Verify enhancement timing targets

## Success Metrics
- Valid session: < 2 seconds to enhance
- Auto-refresh: < 4 seconds total time
- Error handling: < 3 seconds to show clear message
- Zero crashes or infinite loading states

---

**Ready to test!** Start with the normal operation test, then work through the failure scenarios. 