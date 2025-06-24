# CoPrompt V2A Authentication Tests

This directory contains test scripts for validating the V2A authentication implementation.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up API key for testing:
   - Edit `setup_api_key.js`
   - Replace `TEST_API_KEY` with your actual OpenAI API key
   - **⚠️ NEVER commit real API keys to git**

## Running Tests

### Authentication Flow Tests
```bash
node auth_flow.test.js
```

### API Key Setup
```bash
node setup_api_key.js
```

## Security Notes

- Keep real API keys out of git commits
- Use placeholder values in committed code
- The `setup_api_key.js` script is for local testing only

## Test Coverage

- ✅ Authentication enforcement (401 responses)
- ✅ Credit system (25 credits on signup)
- ✅ End-to-end enhancement flow
- ✅ BYOK removal verification 